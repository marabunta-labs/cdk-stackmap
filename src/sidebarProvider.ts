// Nodo raíz para mostrar la carpeta seleccionada
class FolderNode extends CDKTreeNode {
    constructor(public readonly folderName: string, public readonly folderPath: string) {
        super(folderName, vscode.TreeItemCollapsibleState.Expanded);
    }
    async getChildren(): Promise<CDKTreeNode[]> {
        // Este método será sobreescrito por el provider
        return [];
    }
}
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CDKTreeNode } from './nodes/cdkTreeNode';
import { ConstructNode, PropertyNode } from './nodes/nodes';
import { TreeArtifact } from './model/cdk-models';

export class CdkStackProvider implements vscode.TreeDataProvider<CDKTreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<CDKTreeNode | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private templateCache = new Map<string, any>();
    public currentRoot: string = '';

    constructor(initialRoot?: string) {
        this.currentRoot = initialRoot || '';
    }

    setWorkspaceRoot(root: string) {
        this.currentRoot = root;
        this.templateCache.clear();
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CDKTreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CDKTreeNode): Promise<CDKTreeNode[]> {
        if (!this.currentRoot) return [];

        // Si no hay elemento, mostramos la carpeta como raíz
        if (!element) {
            const folderName = path.basename(this.currentRoot);
            return [new FolderNode(folderName, this.currentRoot)];
        }

        // Si el elemento es FolderNode, mostramos los stacks
        if (element instanceof FolderNode) {
            return this.getStacksFromTree();
        }

        if (element instanceof ConstructNode) {
            return this.resolveChildren(element);
        }

        if (element instanceof PropertyNode) {
            return element.getChildren();
        }

        return [];
    }

    private async getStacksFromTree(): Promise<CDKTreeNode[]> {
        const treePath = path.join(this.currentRoot, 'cdk.out', 'tree.json');
        if (!fs.existsSync(treePath)) return [];

        try {
            await this.preloadTemplates();
            
            const treeRaw = JSON.parse(fs.readFileSync(treePath, 'utf-8'));
            const rootArtifact = treeRaw.tree as TreeArtifact;
            const stacks: ConstructNode[] = [];

            if (rootArtifact.children) {
                for (const key in rootArtifact.children) {
                    if (key === 'Tree') continue;
                    stacks.push(new ConstructNode(key, rootArtifact.children[key], undefined)); 
                }
            }
            
            return stacks.sort((a, b) => a.label.localeCompare(b.label));
        } catch (e) { return []; }
    }

    private resolveChildren(parentNode: ConstructNode): CDKTreeNode[] {
        const parentArtifact = (parentNode as any).artifact as TreeArtifact;
        const stackName = this.getStackNameFromPath(parentArtifact.path);
        
        // GRUPO 1: PROPIEDADES (Del Template)
        const propertiesNodes: PropertyNode[] = [];
        const cfnData = (parentNode as any).cfnResource;
        
        if (cfnData && cfnData.Properties) {
             for (const key in cfnData.Properties) {
                 propertiesNodes.push(new PropertyNode(key, cfnData.Properties[key]));
             }
             // Ordenamos propiedades alfabéticamente, protegiendo el tipo
             propertiesNodes.sort((a, b) => {
                 const aLabel = typeof a.label === 'string' ? a.label : (a.label?.label ?? '');
                 const bLabel = typeof b.label === 'string' ? b.label : (b.label?.label ?? '');
                 return aLabel.localeCompare(bLabel);
             });
        }

        // GENERAMOS TODOS LOS HIJOS (Del Tree) PRIMERO
        const allChildNodes: ConstructNode[] = [];
        
        if (parentArtifact.children) {
            for (const key in parentArtifact.children) {
                if (['CDKMetadata', 'Tree', 'Default'].includes(key)) continue;

                const childArtifact: any = parentArtifact.children[key];
                
                // Vinculación con Template (Fuzzy + Exacto)
                let childCfnData = undefined;
                if (stackName && this.templateCache.has(stackName)) {
                    const template = this.templateCache.get(stackName);
                    const resources = template.Resources || {};

                    const explicitId = childArtifact.attributes?.['aws:cdk:cloudformation:elementId'];
                    if (explicitId && resources[explicitId]) {
                        childCfnData = resources[explicitId];
                    } else {
                        const nodeName = key;
                        const match = Object.keys(resources).find(logicalId => {
                            const cleanLogicalId = logicalId.replace(/([0-9a-fA-F]{8})$/, '');
                            return cleanLogicalId === nodeName || cleanLogicalId.endsWith(nodeName);
                        });
                        if (match) childCfnData = resources[match];
                    }
                }

                allChildNodes.push(new ConstructNode(key, childArtifact, childCfnData));
            }
        }

        // GRUPO 2: RECURSOS L1 (Los que tienen tipo AWS::...)
        const l1ResourceNodes = allChildNodes.filter(node => node.contextValue === 'cdkResource');
        l1ResourceNodes.sort((a, b) => a.label.localeCompare(b.label));

        // GRUPO 3: CARPETAS / CONSTRUCTS (El resto)
        const constructFolderNodes = allChildNodes.filter(node => node.contextValue !== 'cdkResource');
        constructFolderNodes.sort((a, b) => a.label.localeCompare(b.label));

        // --- ENSAMBLAJE FINAL: EL ORDEN QUE PEDISTE ---
        // 1. L1 Resources
        // 2. Propiedades
        // 3. Carpetas
        return [
            ...l1ResourceNodes,
            ...propertiesNodes,
            ...constructFolderNodes
        ];
    }

    private async preloadTemplates() {
        const cdkOut = path.join(this.currentRoot, 'cdk.out');
        const manifestPath = path.join(cdkOut, 'manifest.json');
        if (!fs.existsSync(manifestPath)) return;
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            for (const key in manifest.artifacts) {
                const art = manifest.artifacts[key];
                if (art.type === 'aws:cloudformation:stack' && art.properties?.templateFile) {
                    const tplPath = path.join(cdkOut, art.properties.templateFile);
                    if (fs.existsSync(tplPath)) {
                        this.templateCache.set(key, JSON.parse(fs.readFileSync(tplPath, 'utf-8')));
                    }
                }
            }
        } catch (e) {}
    }

    private getStackNameFromPath(nodePath: string): string | undefined {
        return nodePath ? nodePath.split('/')[0] : undefined;
    }

    // Getter público para compatibilidad con extension.ts
    get currentPath(): string {
        return this.currentRoot;
    }
}
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CDKTreeNode } from './nodes/cdkTreeNode';
import { ConstructNode, PropertyNode } from './nodes/nodes';
import { TreeArtifact, GraphData, GraphNode, GraphEdge } from './model/cdk-models';

class FolderNode extends CDKTreeNode {
    constructor(public readonly folderName: string, public readonly folderPath: string) {
        super(folderName, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = new vscode.ThemeIcon('folder-opened');
    }
    async getChildren(): Promise<CDKTreeNode[]> { return []; }
}

export class CdkStackProvider implements vscode.TreeDataProvider<CDKTreeNode> {
    private _onDidChangeTreeData = new vscode.EventEmitter<CDKTreeNode | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private templateCache = new Map<string, any>();
    private pathLogicalIdMap = new Map<string, string>();
    public currentRoot: string = '';

    constructor(initialRoot?: string) { this.currentRoot = initialRoot || ''; }
    setWorkspaceRoot(root: string) { this.currentRoot = root; this.clearCaches(); this.refresh(); }
    refresh(): void { this._onDidChangeTreeData.fire(); }
    getTreeItem(element: CDKTreeNode): vscode.TreeItem { return element; }
    get currentPath(): string { return this.currentRoot; }

    private clearCaches() {
        this.templateCache.clear();
        this.pathLogicalIdMap.clear();
    }

    async getChildren(element?: CDKTreeNode): Promise<CDKTreeNode[]> {
        if (!this.currentRoot) return [];
        if (!element) return [new FolderNode(path.basename(this.currentRoot), this.currentRoot)];
        if (element instanceof FolderNode) return this.getStacksFromTree();
        if (element instanceof ConstructNode) return this.resolveChildren(element);
        if (element instanceof PropertyNode) return element.getChildren();
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
        const nodes: CDKTreeNode[] = [];
        if (parentNode.cfnResource && parentNode.cfnResource.Properties) {
             const props = parentNode.cfnResource.Properties;
             Object.keys(props).sort().forEach(key => nodes.push(new PropertyNode(key, props[key])));
        }
        const parentArtifact = parentNode.artifact;
        if (parentArtifact.children) {
            const stackName = this.getStackNameFromPath(parentArtifact.path);
            for (const key in parentArtifact.children) {
                if (key === 'CDKMetadata' || key === 'Tree') continue;
                const childArtifact = parentArtifact.children[key];
                let cfnData = undefined;
                let logicalId: string | undefined = undefined;

                if (childArtifact.path) {
                    const lookupPath = childArtifact.path.startsWith('/') ? childArtifact.path : `/${childArtifact.path}`;
                    if (this.pathLogicalIdMap.has(lookupPath)) logicalId = this.pathLogicalIdMap.get(lookupPath);
                }
                if (!logicalId) logicalId = childArtifact.attributes?.['aws:cdk:cloudformation:elementId'];

                if (stackName && this.templateCache.has(stackName)) {
                    const template = this.templateCache.get(stackName);
                    const resources = template.Resources || {};
                    if (logicalId && resources[logicalId]) {
                        cfnData = resources[logicalId];
                    } else {
                        const parentClean = parentNode.label.replace(/[^a-zA-Z0-9]/g, '');
                        const isGenericName = ['Resource', 'Default', 'DefaultPolicy', 'Policy'].includes(key);
                        const candidate = Object.keys(resources).find(rId => {
                            const cleanId = rId.replace(/([0-9a-fA-F]{8})$/, ''); 
                            if (cleanId === key) return true;
                            if (cleanId.endsWith(key)) {
                                if (isGenericName) return cleanId.includes(parentClean);
                                return true;
                            }
                            return false;
                        });
                        if (candidate) { logicalId = candidate; cfnData = resources[candidate]; }
                    }
                }
                nodes.push(new ConstructNode(key, childArtifact, cfnData, logicalId));
            }
        }
        return nodes;
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
                if (art.metadata) {
                    for (const pathKey in art.metadata) {
                        const metadataList = art.metadata[pathKey];
                        const logicalIdEntry = metadataList.find((m: any) => m.type === 'aws:cdk:logicalId');
                        if (logicalIdEntry && logicalIdEntry.data) this.pathLogicalIdMap.set(pathKey, logicalIdEntry.data as string);
                    }
                }
            }
        } catch (e) {}
    }

    private getStackNameFromPath(nodePath: string): string | undefined {
        return nodePath ? nodePath.split('/')[0] : undefined;
    }

    // --- GRÁFICO (V8: ZERO ORPHAN RESOURCES) ---
    public async getGraphData(): Promise<GraphData> {
        console.log("--- INICIO GENERACIÓN GRÁFICO (CLEANEST) ---");
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];

        if (!this.currentRoot) return { nodes: [], edges: [] };
        
        await this.preloadTemplates();
        const stacks = await this.getStacksFromTree();

        const logicalIdToNodeId = new Map<string, string>(); 
        const pendingDeps: { source: string; targetLogicalId: string }[] = [];

        let idCounter = 0;
        const generateId = (prefix: string) => `${prefix.replace(/[^a-zA-Z0-9]/g, '')}_${++idCounter}`;

        // LISTA NEGRA EXTENDIDA
        const CDK_NOISE_PATTERNS = [
            'AssetImage', 'Staging', 'S3Obj', 'Code', 'Repository', 'Parameters', 
            'AssetParameters', 'CheckBootstrapVersion'
        ];

        const extractRefs = (obj: any): string[] => {
            const refs = new Set<string>();
            const traverse = (current: any) => {
                if (!current || typeof current !== 'object') return;
                if (current.Ref && typeof current.Ref === 'string') { refs.add(current.Ref); return; }
                if (current['Fn::GetAtt']) {
                    const val = current['Fn::GetAtt'];
                    if (Array.isArray(val) && val.length > 0) refs.add(val[0]);
                    else if (typeof val === 'string') refs.add(val.split('.')[0]);
                    return;
                }
                if (current['Fn::Sub']) {
                    const val = current['Fn::Sub'];
                    const str = Array.isArray(val) ? val[0] : val;
                    if (typeof str === 'string') {
                        const matches = str.match(/\$\{([a-zA-Z0-9]+)\}/g);
                        if (matches) matches.forEach(m => refs.add(m.replace(/[\$\{\}]/g, '')));
                    }
                    if (Array.isArray(val) && val.length > 1) traverse(val[1]);
                    return;
                }
                if (Array.isArray(current)) current.forEach(item => traverse(item));
                else Object.values(current).forEach(child => traverse(child));
            };
            traverse(obj);
            return Array.from(refs);
        };

        const processNode = (treeNode: CDKTreeNode, parentId?: string, currentStackId?: string) => {
            if (!(treeNode instanceof ConstructNode)) return;

            // 1. FILTRO DE NOMBRE (RUIDO CDK)
            if (CDK_NOISE_PATTERNS.some(pattern => treeNode.label.includes(pattern))) return;

            // 2. FILTRO DE RECURSOS HUÉRFANOS EN STACK ROOT
            // Si eres un "Resource" o "Default" suelto, no te pintamos (tu padre debió haberte absorbido).
            // Excepción: Si el padre es el Stack, a veces hay recursos sueltos legítimos, 
            // pero el 99% de las veces "Resource" es un nombre interno que no aporta nada si no tiene un padre semántico.
            if (treeNode.label === 'Resource' || treeNode.label === 'Default') {
                return;
            }

            const nodeId = generateId(treeNode.label);
            
            let myStackId = currentStackId;
            let visualParent = currentStackId;

            if (treeNode.contextValue === 'cdkStack') {
                myStackId = nodeId;
                visualParent = undefined;
            }

            const children = this.resolveChildren(treeNode);
            let primaryLogicalId = treeNode.logicalId;
            let primaryChild: ConstructNode | undefined;

            // --- HOISTING DE IDENTIDAD ---
            if (!primaryLogicalId) {
                primaryChild = children.find(c => 
                    c instanceof ConstructNode && 
                    c.logicalId && 
                    (c.label === 'Resource' || c.label === 'Default')
                ) as ConstructNode | undefined;

                if (primaryChild && primaryChild.logicalId) {
                    primaryLogicalId = primaryChild.logicalId;
                }
            }

            if (primaryLogicalId) {
                if (!logicalIdToNodeId.has(primaryLogicalId)) {
                    logicalIdToNodeId.set(primaryLogicalId, nodeId);
                }
            }

            // --- TIPO ---
            let nodeType = 'Construct';
            if (treeNode.contextValue === 'cdkStack') nodeType = 'Stack';
            else if (treeNode.cfnResource?.Type) nodeType = treeNode.cfnResource.Type;
            else if (primaryChild && primaryChild.cfnResource?.Type) nodeType = primaryChild.cfnResource.Type;
            else if (treeNode.artifact.attributes?.['aws:cdk:cloudformation:type']) nodeType = treeNode.artifact.attributes['aws:cdk:cloudformation:type'];

            // --- FILTRO ESTRUCTURAL (Carpetas vacías) ---
            const isGenericConstruct = nodeType === 'Construct';
            const hasConstructChildren = children.some(c => c instanceof ConstructNode && c.label !== 'Resource' && c.label !== 'Default');
            
            if (isGenericConstruct && !primaryLogicalId && !hasConstructChildren) {
                return; // Construct vacío sin identidad AWS ni hijos reales
            }

            // --- EXTRACCIÓN DE DEPENDENCIAS (INCLUYENDO HIJOS OCULTOS) ---
            const scanProps = (nodesToScan: CDKTreeNode[]) => {
                nodesToScan.forEach(child => {
                    // Si es una propiedad directa
                    if (child instanceof PropertyNode) {
                        extractRefs(child.value).forEach(ref => {
                            if (!ref.startsWith('AWS::')) pendingDeps.push({ source: nodeId, targetLogicalId: ref });
                        });
                    }
                    // Si es un nodo hijo "Resource" (que vamos a ocultar), extraemos sus props también
                    // Esto asegura que si el recurso interno tiene dependencias, se le atribuyen al padre visible.
                    if (child instanceof ConstructNode && (child.label === 'Resource' || child.label === 'Default')) {
                        const grandChildren = this.resolveChildren(child);
                        scanProps(grandChildren);
                        
                        // También chequeamos DependsOn del hijo oculto
                        if (child.cfnResource?.DependsOn) {
                            const deps = Array.isArray(child.cfnResource.DependsOn) ? child.cfnResource.DependsOn : [child.cfnResource.DependsOn];
                            deps.forEach((d: string) => pendingDeps.push({ source: nodeId, targetLogicalId: d }));
                        }
                    }
                });
            };

            // Escaneamos mis hijos directos
            scanProps(children);

            // Mis propios DependsOn
            if (treeNode.cfnResource?.DependsOn) {
                const deps = Array.isArray(treeNode.cfnResource.DependsOn) ? treeNode.cfnResource.DependsOn : [treeNode.cfnResource.DependsOn];
                deps.forEach((d: string) => pendingDeps.push({ source: nodeId, targetLogicalId: d }));
            }

            nodes.push({
                data: {
                    id: nodeId,
                    label: treeNode.label as string,
                    type: nodeType,
                    parent: visualParent
                }
            });

            // RECURSIÓN
            children.forEach(child => {
                if (child instanceof ConstructNode) {
                    // IMPORTANTE: Ya hemos extraído la info de 'Resource' y 'Default' en scanProps.
                    // Ahora simplemente NO los procesamos recursivamente para que no generen nodos.
                    if (child.label !== 'Resource' && child.label !== 'Default') {
                        processNode(child, nodeId, myStackId);
                    }
                }
            });
        };

        for (const stack of stacks) processNode(stack);

        const uniqueEdges = new Set<string>();
        pendingDeps.forEach((dep, idx) => {
            const targetNodeId = logicalIdToNodeId.get(dep.targetLogicalId);
            
            if (targetNodeId && targetNodeId !== dep.source) {
                const edgeKey = `${dep.source}->${targetNodeId}`;
                if (!uniqueEdges.has(edgeKey)) {
                    edges.push({
                        data: {
                            id: `dep_${idx}`,
                            source: dep.source,
                            target: targetNodeId,
                            type: 'dependency'
                        }
                    });
                    uniqueEdges.add(edgeKey);
                }
            }
        });

        console.log("--- FIN ---");
        return { nodes, edges };
    }
}
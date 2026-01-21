import * as vscode from 'vscode';
import { CDKTreeNode } from './nodes/cdkTreeNode';
import { AppNode, MessageNode } from './nodes/nodes';

export class CdkStackProvider implements vscode.TreeDataProvider<CDKTreeNode> {
        public get currentPath(): string {
            return this.currentRoot;
        }
    
    private _onDidChangeTreeData = new vscode.EventEmitter<CDKTreeNode | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private currentRoot: string = '';

    constructor(initialRoot?: string) {
        this.currentRoot = initialRoot || '';
    }

    setWorkspaceRoot(root: string) {
        this.currentRoot = root;
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    // 1. Obtener el elemento visual (delegamos en el nodo)
    getTreeItem(element: CDKTreeNode): vscode.TreeItem {
        return element;
    }

    // 2. Obtener hijos (delegamos en el nodo)
    async getChildren(element?: CDKTreeNode): Promise<CDKTreeNode[]> {
        
        // A. Si no hay nodo padre, estamos en la raíz: devolvemos la App
        if (!element) {
            if (!this.currentRoot) {
                // Si no hay carpeta, devolvemos array vacío para activar el "Welcome View" (Botón azul)
                return []; 
            }
            return [new AppNode(this.currentRoot)];
        }

        // B. Si hay nodo padre, le preguntamos a él por sus hijos
        return element.getChildren();
    }
}
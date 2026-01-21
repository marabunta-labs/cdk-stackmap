import * as vscode from 'vscode';

export abstract class CDKTreeNode extends vscode.TreeItem {
    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState);
    }

    // Cada nodo debe implementar su propia lógica para obtener hijos
    abstract getChildren(): Promise<CDKTreeNode[]>;
}
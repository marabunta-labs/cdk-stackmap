import * as vscode from 'vscode';

export abstract class CDKTreeNode extends vscode.TreeItem {
    constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState);
    }

    abstract getChildren(): Promise<CDKTreeNode[]>;
}
import * as vscode from 'vscode';
import { CDKTreeNode } from './cdkTreeNode';
import { TreeArtifact, CfnResource } from '../model/cdk-models';

// --- CONSTRUCT NODE ---
export class ConstructNode extends CDKTreeNode {
    constructor(
        public readonly label: string,
        private readonly artifact: TreeArtifact,
        private readonly cfnResource?: CfnResource
    ) {
        // ¿Tiene hijos en el árbol O tiene propiedades de CFN?
        const hasTreeChildren = artifact.children && Object.keys(artifact.children).length > 0;
        const hasProps = cfnResource && cfnResource.Properties && Object.keys(cfnResource.Properties).length > 0;
        
        super(label, (hasTreeChildren || hasProps) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

        // Iconografía
        const type = artifact.attributes?.['aws:cdk:cloudformation:type'];
        const isStack = artifact.path && !artifact.path.includes('/');

        if (isStack) {
            this.contextValue = 'cdkStack';
            this.iconPath = new vscode.ThemeIcon('layers');
            this.description = 'Stack';
            this.tooltip = artifact.path;
        } else if (type) {
            this.contextValue = 'cdkResource';
            this.iconPath = this.getIconForType(type);
            this.description = type.split('::').pop(); 
            // Mostramos si hemos logrado vincular datos reales
            const status = cfnResource ? '(Linked)' : '(No Props)'; 
            this.tooltip = `Type: ${type}\n${status}`;
        } else {
            this.contextValue = 'cdkConstruct';
            this.iconPath = new vscode.ThemeIcon('symbol-package');
        }
    }

    // El provider se encarga de llamar a getChildren, aquí devolvemos vacío para delegar
    async getChildren(): Promise<CDKTreeNode[]> { return []; }

    private getIconForType(type: string): vscode.ThemeIcon {
        if (type.includes('S3::Bucket')) return new vscode.ThemeIcon('database');
        if (type.includes('Lambda')) return new vscode.ThemeIcon('symbol-function');
        if (type.includes('DynamoDB')) return new vscode.ThemeIcon('list-flat');
        if (type.includes('IAM')) return new vscode.ThemeIcon('shield');
        if (type.includes('ApiGateway')) return new vscode.ThemeIcon('globe');
        return new vscode.ThemeIcon('symbol-interface');
    }
}

// --- PROPERTY NODE (Recursivo) ---
export class PropertyNode extends CDKTreeNode {
    constructor(public readonly key: string, public readonly value: any) {
        
        const isObject = typeof value === 'object' && value !== null;
        const isArray = Array.isArray(value);
        
        // Etiqueta: Si es objeto mostramos solo la Key, si es valor mostramos "Key: Valor"
        let displayLabel = key;
        
        if (!isObject) {
            displayLabel = `${key}: ${value}`;
        } else if (isArray) {
            displayLabel = `${key} [${value.length}]`; // Ej: "Statement [2]"
        }

        const state = isObject ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        
        super(displayLabel, state);
        
        this.contextValue = 'cdkProperty';
        
        if (isArray) this.iconPath = new vscode.ThemeIcon('symbol-array');
        else if (isObject) this.iconPath = new vscode.ThemeIcon('json');
        else this.iconPath = new vscode.ThemeIcon('symbol-property');
    }

    async getChildren(): Promise<CDKTreeNode[]> {
        if (typeof this.value !== 'object' || this.value === null) return [];

        // Manejo de Arrays (Indices [0], [1]...)
        if (Array.isArray(this.value)) {
            return this.value.map((item, idx) => new PropertyNode(`[${idx}]`, item));
        }

        // Manejo de Objetos
        return Object.keys(this.value).map(k => new PropertyNode(k, this.value[k]));
    }
}
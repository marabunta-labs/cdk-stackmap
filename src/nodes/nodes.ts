import * as vscode from 'vscode';
import { CDKTreeNode } from './cdkTreeNode';
import { TreeArtifact, CfnResource } from '../model/cdk-models';

// --- CONSTRUCT NODE (El nodo carpeta o recurso) ---
export class ConstructNode extends CDKTreeNode {
    constructor(
        public readonly label: string,
        public readonly artifact: TreeArtifact,
        public readonly cfnResource?: CfnResource, // Datos del template.json
        public readonly logicalId?: string
    ) {
        // Determinamos si es un recurso L1 (El que lleva el Type de CloudFormation)
        const cfnType = cfnResource?.Type || artifact.attributes?.['aws:cdk:cloudformation:type'];
        
        // CALCULAMOS EL LABEL AL ESTILO AWS TOOLKIT
        // Si es un recurso L1, mostramos "Resource (AWS::...)"
        // Si es un L2, mostramos el nombre del construct
        let displayLabel = label;
        if (label === 'Resource' && cfnType) {
            displayLabel = `Resource (${cfnType})`;
        } else if (cfnType) {
            displayLabel = `${label} (${cfnType})`; // Fallback por si no se llama "Resource"
        }

        // COLAPSABLE: Si tiene hijos en el tree.json O tiene propiedades de CloudFormation
        const hasTreeChildren = artifact.children && Object.keys(artifact.children).length > 0;
        const hasProps = cfnResource && cfnResource.Properties && Object.keys(cfnResource.Properties).length > 0;
        
        super(displayLabel, (hasTreeChildren || hasProps) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

        // ICONOS Y CONTEXTO
        const isStack = artifact.path && !artifact.path.includes('/');
        
        if (isStack) {
            this.contextValue = 'cdkStack';
            this.iconPath = new vscode.ThemeIcon('layers');
            this.description = 'Stack';
        } else if (cfnType) {
            this.contextValue = 'cdkResource';
            this.iconPath = this.getIconForType(cfnType);
            this.tooltip = `Logical ID: ${logicalId || 'N/A'}\nType: ${cfnType}`;
        } else {
            this.contextValue = 'cdkConstruct';
            this.iconPath = new vscode.ThemeIcon('symbol-package');
        }
    }

    // Para el gráfico
    get graphId(): string { return this.artifact.path || this.label; }

    async getChildren(): Promise<CDKTreeNode[]> { return []; }

    private getIconForType(type: string): vscode.ThemeIcon {
        if (type.includes('Lambda')) return new vscode.ThemeIcon('server-process');
        if (type.includes('LogGroup')) return new vscode.ThemeIcon('output');
        if (type.includes('S3')) return new vscode.ThemeIcon('database');
        if (type.includes('IAM')) return new vscode.ThemeIcon('shield');
        if (type.includes('DynamoDB')) return new vscode.ThemeIcon('list-flat');
        return new vscode.ThemeIcon('symbol-interface');
    }
}

// --- PROPERTY NODE (Recursivo Puro - Estilo AWS) ---
export class PropertyNode extends CDKTreeNode {
    constructor(
        public readonly key: string, 
        public readonly value: any,
        public readonly isArrayItem: boolean = false
    ) {
        let displayLabel = key;
        let description = '';
        let collapsible = vscode.TreeItemCollapsibleState.None;
        let icon = 'symbol-property';

        const isObject = typeof value === 'object' && value !== null;
        const isArray = Array.isArray(value);

        // 1. ETIQUETA (LABEL)
        if (isArrayItem) {
            displayLabel = `${key}:`; // Si es item de array, el key es el índice "0:", "1:"
        }

        // 2. VALOR Y DESCRIPCION
        if (!isObject) {
            // Primitivos: string, number, boolean
            displayLabel = `${key}: ${value}`;
            if (typeof value === 'string') icon = 'symbol-text';
            else if (typeof value === 'boolean') icon = 'symbol-boolean';
            else icon = 'symbol-number';
        } else {
            // Objetos y Arrays complejos
            collapsible = vscode.TreeItemCollapsibleState.Collapsed;
            
            // Detección especial SOLO para iconos/texto, pero seguimos permitiendo expandir
            if (value['Ref']) {
                description = `Ref: ${value['Ref']}`; 
                icon = 'references';
            } else if (value['Fn::GetAtt']) {
                description = `GetAtt: ${value['Fn::GetAtt'][0]}`;
                icon = 'references';
            } else if (value['Fn::Join']) {
                displayLabel = isArrayItem ? key : `${key}`; // Mantenemos nombre limpio
                description = 'Fn::Join';
                icon = 'combine';
            } else if (value['Fn::Sub']) {
                description = 'Fn::Sub';
                icon = 'code';
            } else if (isArray) {
                icon = 'symbol-array';
                description = `[${value.length}]`;
            } else {
                icon = 'json'; // Objeto genérico
            }
        }

        super(displayLabel, collapsible);
        this.description = description;
        this.contextValue = 'cdkProperty';
        this.iconPath = new vscode.ThemeIcon(icon);
    }

    async getChildren(): Promise<CDKTreeNode[]> {
        if (typeof this.value !== 'object' || this.value === null) return [];

        // RECURSIVIDAD PURA: 
        // Si es array, devolvemos nodos 0, 1, 2...
        // Si es objeto, devolvemos claves.
        
        if (Array.isArray(this.value)) {
            return this.value.map((item, idx) => new PropertyNode(`${idx}`, item, true));
        }

        return Object.keys(this.value).map(k => new PropertyNode(k, this.value[k]));
    }
}
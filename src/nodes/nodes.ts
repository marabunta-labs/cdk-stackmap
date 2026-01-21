import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CDKTreeNode } from './cdkTreeNode';

// --- 1. APP NODE (Entrada) ---
export class AppNode extends CDKTreeNode {
    constructor(public readonly rootPath: string) {
        super(path.basename(rootPath), vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'cdkApp';
        this.iconPath = new vscode.ThemeIcon('cloud');
        this.description = 'CDK App';
    }

    async getChildren(): Promise<CDKTreeNode[]> {
        const treePath = path.join(this.rootPath, 'cdk.out', 'tree.json');

        if (!fs.existsSync(treePath)) {
            return [new MessageNode('No se encontró tree.json. Ejecuta "cdk synth"')];
        }

        try {
            const tree = JSON.parse(fs.readFileSync(treePath, 'utf-8'));
            
            // El árbol del CDK tiene una raíz llamada "tree"
            const rootMap = tree.tree || {};
            
            // Empezamos a recorrer desde los hijos de la raíz
            return this.parseConstructs(rootMap.children);
        } catch (error) {
            return [new MessageNode('Error leyendo tree.json')];
        }
    }

    private parseConstructs(childrenMap: any): CDKTreeNode[] {
        if (!childrenMap) return [];
        
        const nodes: CDKTreeNode[] = [];

        for (const key in childrenMap) {
            const child = childrenMap[key];
            
            // Filtramos nodos internos irrelevantes del CDK (Tree, Default, etc.)
            // Puedes ajustar este filtro si quieres ver más o menos cosas
            if (key === 'Tree' || !child) continue;

            nodes.push(new ConstructNode(key, child));
        }

        return nodes;
    }
}

// --- 2. CONSTRUCT NODE (El Nodo Universal) ---
// Representa cualquier cosa: Stack, Recurso, Constructo L2, L3...
export class ConstructNode extends CDKTreeNode {
    private childrenData: any;
    private attributes: any;

    constructor(label: string, data: any) {
        // Determinamos si debe estar abierto o cerrado
        // Si tiene hijos, lo mostramos colapsado.
        const hasChildren = data.children && Object.keys(data.children).length > 0;
        const state = hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;

        super(label, state);
        
        this.childrenData = data.children;
        this.attributes = data.attributes || {};
        
        // --- DETECCIÓN DE TIPO E ICONOS ---
        // El CDK suele guardar info del recurso en 'attributes' o en el 'path'
        
        const cdkPath = data.path || '';
        
        // Es un Stack?
        if (data.id && data.path && !cdkPath.includes('/')) {
             this.contextValue = 'cdkStack';
             this.iconPath = new vscode.ThemeIcon('layers');
             this.description = 'Stack';
        } 
        // Es un Recurso AWS (L1)? (Suele tener 'aws:cdk:cloudformation:type')
        else if (this.attributes['aws:cdk:cloudformation:type']) {
            this.contextValue = 'cdkResource';
            const type = this.attributes['aws:cdk:cloudformation:type'];
            this.description = type; // Ej: AWS::S3::Bucket
            this.iconPath = this.getIconForType(type);
        }
        // Es un Constructo L2/L3 (Agrupador lógico)?
        else {
            this.contextValue = 'cdkConstruct';
            this.iconPath = new vscode.ThemeIcon('symbol-package'); // Cajita
            // A veces es útil poner la clase constructora si existe
            // this.description = 'Construct';
        }

        // Tooltip con info de debug
        this.tooltip = `Path: ${cdkPath}`;
    }

    async getChildren(): Promise<CDKTreeNode[]> {
        if (!this.childrenData) return [];

        const nodes: CDKTreeNode[] = [];
        
        for (const key in this.childrenData) {
            const child = this.childrenData[key];
            
            // FILTROS DE RUIDO:
            // El CDK mete muchas cosas "invisibles" como 'Resource', 'Default', 'Bootstrap'.
            // Para que se vea limpio como la extensión oficial, hay que filtrar.
            
            // 1. Si el hijo se llama 'Resource' y es el único hijo, a menudo queremos "elevarlo"
            // (Merge visual), pero por simplicidad, vamos a mostrarlo.
            
            // 2. Ocultar nodos de metadatos puros si no te interesan
            if (key === 'CDKMetadata') continue; 

            nodes.push(new ConstructNode(key, child));
        }

        return nodes;
    }

    private getIconForType(type: string): vscode.ThemeIcon {
        if (type.includes('S3')) return new vscode.ThemeIcon('database');
        if (type.includes('Lambda')) return new vscode.ThemeIcon('symbol-function');
        if (type.includes('Dynamo')) return new vscode.ThemeIcon('list-flat');
        if (type.includes('IAM')) return new vscode.ThemeIcon('shield');
        if (type.includes('ApiGateway')) return new vscode.ThemeIcon('globe');
        return new vscode.ThemeIcon('symbol-interface');
    }
}

// --- 3. NODOS AUXILIARES ---
export class MessageNode extends CDKTreeNode {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('warning');
    }
    async getChildren(): Promise<CDKTreeNode[]> { return []; }
}
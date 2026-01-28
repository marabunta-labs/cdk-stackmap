import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
// ELIMINADO: import { parseCloudFormation, GraphData } from './parser';
import { CdkStackProvider } from './sidebarProvider';
import { GraphData } from './model/cdk-models'; // Asegúrate de importar la interfaz correcta

const AREA_SIZES: { [key: string]: { w: number, h: number } } = {
    'XS':  { w: 3000,  h: 1800 },
    'S':   { w: 6000,  h: 3600 },
    'M':   { w: 9000,  h: 5400 },
    'L':   { w: 12000, h: 7200 },
    'XL':  { w: 18000, h: 10800 },
    'XXL': { w: 24000, h: 14400 }
};

/**
 * Función principal para generar y mostrar el gráfico
 * AHORA RECIBE EL PROVIDER EN LUGAR DE LA RUTA RAW
 */
async function scanAndShowGraph(provider: CdkStackProvider, context: vscode.ExtensionContext) {
    const rootPath = provider.currentPath;
    const folderName = path.basename(rootPath);
    
    // Verificación básica
    if (!rootPath) {
        vscode.window.showErrorMessage('No hay una carpeta CDK seleccionada.');
        return;
    }

    try {
        // --- CAMBIO PRINCIPAL ---
        // Delegamos la obtención de datos al Provider para que coincida con el Tree View
        const finalGraph = await provider.getGraphData();
        
        // Verificación de datos
        if (finalGraph.nodes.length === 0) {
             vscode.window.showWarningMessage('No se encontraron datos para graficar. Asegúrate de haber sintetizado (cdk synth).');
             return;
        }
        
        // Contamos stacks para el título (buscamos nodos tipo 'Stack')
        const stacksFound = finalGraph.nodes.filter(n => n.data?.type === 'Stack').length;

        const panel = vscode.window.createWebviewPanel(
            'cdkStackMap',
            `${folderName} (${stacksFound} Stacks)`,
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
				retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
            }
        );

        // Generamos el HTML pasando los datos del provider
        const htmlContent = getHtmlForWebview(context, finalGraph, stacksFound);
        panel.webview.html = htmlContent;
        
        // --- GESTIÓN DE MENSAJES (Descargas y Config) ---
        // (Este bloque se mantiene prácticamente igual)
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'downloadPNG') {
                try {
                    const defaultFileName = `cdk-stack-${folderName}-${new Date().toISOString().split('T')[0]}.png`;
                    const uri = await vscode.window.showSaveDialog({
                        defaultUri: vscode.Uri.file(path.join(rootPath, defaultFileName)),
                        filters: { 'PNG Images': ['png'] }
                    });
                    if (uri) {
                        const base64Data = message.data.replace(/^data:image\/png;base64,/, '');
                        const buffer = Buffer.from(base64Data, 'base64');
                        fs.writeFileSync(uri.fsPath, buffer);
                        vscode.window.showInformationMessage(`Gráfico guardado en: ${uri.fsPath}`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage('Error al guardar el archivo PNG.');
                    console.error(error);
                }
            }
            if (message.type === 'downloadSVG') {
                try {
                    const defaultFileName = `cdk-stack-${folderName}-${new Date().toISOString().split('T')[0]}.svg`;
                    const uri = await vscode.window.showSaveDialog({
                        defaultUri: vscode.Uri.file(path.join(rootPath, defaultFileName)),
                        filters: { 'SVG Images': ['svg'] }
                    });
                    if (uri) {
                        const base64Data = message.data.replace(/^data:image\/svg\+xml;base64,/, '');
                        const svgString = Buffer.from(base64Data, 'base64').toString('utf-8');
                        fs.writeFileSync(uri.fsPath, svgString, 'utf-8');
                        vscode.window.showInformationMessage(`SVG guardado en: ${uri.fsPath}`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage('Error al guardar el archivo SVG.');
                    console.error(error);
                }
            }
        });
        
        // Listener de Configuración
        const configListener = vscode.workspace.onDidChangeConfiguration(e => {
            const config = vscode.workspace.getConfiguration('cdk-stackmap');
            let changed = false;
            const configUpdate: any = {};
            if (e.affectsConfiguration('cdk-stackmap.showMinimap')) {
                configUpdate.showMinimap = config.get('showMinimap', true);
                changed = true;
            }
            if (e.affectsConfiguration('cdk-stackmap.nodeColorMode')) {
                configUpdate.nodeColorMode = config.get('nodeColorMode', 'fill');
                changed = true;
            }
			if (e.affectsConfiguration('cdk-stackmap.graphAreaSize')) {
				const sizeKey = config.get('graphAreaSize', 'M'); // String: "M"
				const dims = AREA_SIZES[sizeKey] || AREA_SIZES['M']; // Objeto: {w, h}
				
				// Enviamos los números crudos al frontend
				configUpdate.graphAreaWidth = dims.w;
				configUpdate.graphAreaHeight = dims.h;
				changed = true;
			}

            if (changed) {
                panel.webview.postMessage({ type: 'updateConfig', config: configUpdate });
            }
        });
        context.subscriptions.push(configListener);

    } catch (error) {
        vscode.window.showErrorMessage('Error procesando el CDK Stack.');
        console.error(error);
    }
}

export function activate(context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const initialRoot = workspaceFolders && workspaceFolders[0]?.uri.fsPath || '';
    
    // Instancia única del provider
    const stackProvider = new CdkStackProvider(initialRoot);
    
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('cdkStackMapView', stackProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cdk-stackmap.selectFolder', async () => {
            const folders = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
                openLabel: 'Seleccionar carpeta CDK'
            });
            if (folders && folders.length > 0) {
                stackProvider.setWorkspaceRoot(folders[0].fsPath);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cdk-stackmap.visualize', async () => {
            const root = stackProvider.currentPath;
            if (!root) {
                vscode.window.showWarningMessage('Selecciona primero una carpeta CDK.');
                return;
            }
            // CAMBIO: Pasamos el provider completo, no solo la ruta
            await scanAndShowGraph(stackProvider, context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cdk-stackmap.refresh', () => {
            stackProvider.refresh();
        })
    );
}

function getHtmlForWebview(context: vscode.ExtensionContext, graphData: GraphData, count: number): string {
    const htmlPath = path.join(context.extensionPath, 'media', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');

    html = html.replace('{{stackCount}}', count.toString());
    html = html.replace('{{graphData}}', JSON.stringify(graphData));

    const config = vscode.workspace.getConfiguration('cdk-stackmap');
    // 1. Obtener la talla (letra)
    const sizeKey = config.get('graphAreaSize', 'M');
    
    // 2. Traducir a números
    const dims = AREA_SIZES[sizeKey] || AREA_SIZES['M'];

    const configObj = {
        showMinimap: config.get('showMinimap', true),
        nodeColorMode: config.get('nodeColorMode', 'fill'),
        // 3. Pasar los números calculados al HTML
        graphAreaWidth: dims.w,
        graphAreaHeight: dims.h
    };
    
    // Inyectamos la configuración
    html = html.replace('<body>', `<body>\n<script>window.__USER_CONFIG__ = ${JSON.stringify(configObj)};<\/script>`);
    return html;
}

export function deactivate() {}
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseCloudFormation, GraphData } from './parser';

export function activate(context: vscode.ExtensionContext) {
	
	let disposable = vscode.commands.registerCommand('cdk-stackmap.visualize', async () => {
		
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) return;
		
		const rootPath = workspaceFolders[0].uri.fsPath;
		const cdkOutPath = path.join(rootPath, 'cdk.out');
		const manifestPath = path.join(cdkOutPath, 'manifest.json');
		
		if (!fs.existsSync(manifestPath)) {
			vscode.window.showErrorMessage('No se encontró cdk.out. Ejecuta "cdk synth".');
			return;
		}

		try {
			const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
			let allNodes: any[] = [];
			let allEdges: any[] = [];
			let stacksFound = 0;

			for (const key in manifest.artifacts) {
				const artifact = manifest.artifacts[key];
				if (artifact.type === 'aws:cloudformation:stack' && artifact.properties && artifact.properties.templateFile) {
					const templateFileName = artifact.properties.templateFile;
					const templatePath = path.join(cdkOutPath, templateFileName);
					if (fs.existsSync(templatePath)) {
						const templateObj = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
						const graphData = parseCloudFormation(templateObj, key);
						allNodes = [...allNodes, ...graphData.nodes];
						allEdges = [...allEdges, ...graphData.edges];
						stacksFound++;
					}
				}
			}
            
            if (stacksFound === 0) {
				vscode.window.showWarningMessage('No se encontraron Stacks válidos.');
				return;
			}

			const finalGraph: GraphData = { nodes: allNodes, edges: allEdges };

            // Creamos el panel
			const panel = vscode.window.createWebviewPanel(
				'cdkStackMap',
				`CDK Map (${stacksFound} Stacks)`,
				vscode.ViewColumn.Two,
				{ 
                    enableScripts: true,
                    // Importante para cuando quieras cargar CSS locales en el futuro
                    localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
                }
			);

            // CARGAMOS EL HTML DESDE EL ARCHIVO
            const htmlContent = getHtmlForWebview(context, finalGraph, stacksFound);
			panel.webview.html = htmlContent;

		} catch (error) {
			vscode.window.showErrorMessage('Error procesando el CDK Stack.');
			console.error(error);
		}
	});

	context.subscriptions.push(disposable);
}

function getHtmlForWebview(context: vscode.ExtensionContext, graphData: GraphData, count: number): string {
    // 1. Obtenemos la ruta del archivo HTML en disco
    const htmlPath = path.join(context.extensionPath, 'media', 'index.html');
    
    // 2. Leemos el contenido como texto
    let html = fs.readFileSync(htmlPath, 'utf-8');

    // 3. Reemplazamos las marcas {{...}} por los datos reales
    html = html.replace('{{stackCount}}', count.toString());
    html = html.replace('{{graphData}}', JSON.stringify(graphData));

    return html;
}

export function deactivate() {}
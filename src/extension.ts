import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseCloudFormation, GraphData } from './parser';
import { CdkStackProvider } from './sidebarProvider';

// ...existing code...

async function scanAndShowGraph(rootPath: string, context: vscode.ExtensionContext) {
	const cdkOutPath = path.join(rootPath, 'cdk.out');
	const manifestPath = path.join(cdkOutPath, 'manifest.json');
	const folderName = path.basename(rootPath);
	if (!fs.existsSync(manifestPath)) {
		vscode.window.showErrorMessage('No se encontró cdk.out en la ruta seleccionada.');
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
		const panel = vscode.window.createWebviewPanel(
			'cdkStackMap',
			`${folderName} (${stacksFound} Stacks)`,
			vscode.ViewColumn.Two,
			{
				enableScripts: true,
				localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
			}
		);
		const htmlContent = getHtmlForWebview(context, finalGraph, stacksFound);
		panel.webview.html = htmlContent;
		// Config listener igual que antes
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
// Registrar el SidebarProvider en activate
export function activate(context: vscode.ExtensionContext) {
	// Inicializa el provider con la primera carpeta del workspace (o vacío)
	const workspaceFolders = vscode.workspace.workspaceFolders;
	const initialRoot = workspaceFolders && workspaceFolders[0]?.uri.fsPath || '';
	const stackProvider = new CdkStackProvider(initialRoot);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('cdkStackMapView', stackProvider)
	);

	// Comando para elegir carpeta y refrescar el árbol
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

	// Comando clásico para visualizar el stack de la ruta actual del provider
	context.subscriptions.push(
		vscode.commands.registerCommand('cdk-stackmap.visualize', async () => {
			const root = stackProvider.currentPath;
			if (!root) {
				vscode.window.showWarningMessage('Selecciona primero una carpeta CDK.');
				return;
			}
			await scanAndShowGraph(root, context);
		})
	);

	// Comando para refrescar el árbol de stacks
	context.subscriptions.push(
		vscode.commands.registerCommand('cdk-stackmap.refresh', () => {
			stackProvider.refresh();
		})
	);
}
// ...existing code...

function getHtmlForWebview(context: vscode.ExtensionContext, graphData: GraphData, count: number): string {
	// 1. Obtenemos la ruta del archivo HTML en disco
	const htmlPath = path.join(context.extensionPath, 'media', 'index.html');
	// 2. Leemos el contenido como texto
	let html = fs.readFileSync(htmlPath, 'utf-8');

	// 3. Reemplazamos las marcas {{...}} por los datos reales
	html = html.replace('{{stackCount}}', count.toString());
	html = html.replace('{{graphData}}', JSON.stringify(graphData));

	// 4. Leer configuración y pasarla como JSON embebido, asegurando que esté disponible antes de cualquier script
	const config = vscode.workspace.getConfiguration('cdk-stackmap');
	const configObj = {
		showMinimap: config.get('showMinimap', true),
		nodeColorMode: config.get('nodeColorMode', 'fill')
	};
	// Inyectar el objeto global justo después de <body>
	html = html.replace('<body>', `<body>\n<script>window.__USER_CONFIG__ = ${JSON.stringify(configObj)};<\/script>`);
	return html;
}

export function deactivate() {}
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ccConfigHandler } from './ccConfigHandler';
import { ccScmProvider } from './ccScmProvider';
import { ViewType } from './clearcase';
import { UIInformation } from './uiinformation';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
async function _activate(context: vscode.ExtensionContext, disposables: vscode.Disposable[]) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('[vscode-clearcase] activated!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel("Clearcase SCM");

	let configHandler = new ccConfigHandler(context, disposables);
	
	let provider = new ccScmProvider(context, disposables, outputChannel, configHandler);
	provider.bindEvents();
	provider.bindCommands();

	provider.updateIsView().then((is:boolean) => {
			vscode.commands.executeCommand('setContext', 'vscode-clearcase:enabled', is);
			vscode.commands.executeCommand('setContext', 'vscode-clearcase:DynView', provider.ClearCase.ViewType==ViewType.DYNAMIC);
	})

	provider.onWindowChanged(() => {
			vscode.commands.executeCommand('setContext', 'vscode-clearcase:enabled', provider.ClearCase.IsView);
			vscode.commands.executeCommand('setContext', 'vscode-clearcase:DynView', provider.ClearCase.ViewType==ViewType.DYNAMIC);
	}, provider);

	let uiInfo = new UIInformation(context, disposables, configHandler, vscode.window.activeTextEditor, provider.ClearCase);
	uiInfo.createStatusbarItem();
	uiInfo.bindEvents();
	uiInfo.initialQuery();

	provider.ClearCase.onCommandExecuted(() => {
			uiInfo.initialQuery();
	}, uiInfo);
}

export async function activate(context: vscode.ExtensionContext) {

	const disposables: vscode.Disposable[] = [];
	context.subscriptions.push(
		new vscode.Disposable(() => vscode.Disposable.from(...disposables).dispose())
	);
	if( vscode.workspace.workspaceFolders !== undefined &&
			vscode.workspace.workspaceFolders.length > 0 )
	{
			await _activate(context, disposables).catch(err => console.error(err));
	}
}

// this method is called when your extension is deactivated
export function deactivate() {
}


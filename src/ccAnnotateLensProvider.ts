import * as vscode from 'vscode';
import {CCAnnotateLens} from './ccAnnotateLens';
import {CCConfigHandler} from './ccConfigHandler';
import { CCScmProvider } from './ccScmProvider';

export class CCCodeLensProvider implements vscode.CodeLensProvider
{
	static selector = {
		scheme: "file"
	};

	public constructor(private mContext: vscode.ExtensionContext, private mCfg: CCConfigHandler, private mProvider: CCScmProvider)
	{
	}

	public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Thenable<vscode.CodeLens[]> | vscode.CodeLens[]
	{
		if ( !this.mCfg.configuration.showAnnotationCodeLens.value ) {
			return [];
		}
		
		let lLenses: vscode.CodeLens[] = [];
		return new Promise(resolve => {
			this.mProvider.clearCase.isClearcaseObject(document.uri).then((is:boolean) => {
				if( document !== undefined && is === true ) {
					lLenses.push(new CCAnnotateLens(document, new vscode.Range(0,0,0,1)));
				}
				resolve(lLenses);
			});
		});
	}

	public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): Thenable<vscode.CodeLens>
	{
		if( codeLens instanceof CCAnnotateLens ) {
			return this.ccAnnotationCommand(codeLens, token);
		}

		return Promise.reject<vscode.CodeLens>(undefined);
	}

	private ccAnnotationCommand(iLens: CCAnnotateLens, iToken: vscode.CancellationToken)
	{
		iLens.command = {
			title: "Toggle annotations",
			command: "extension.ccAnnotate",
			arguments: [iLens.document.uri]
		};
		return Promise.resolve(iLens);
	}
}
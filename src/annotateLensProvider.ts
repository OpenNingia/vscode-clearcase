'use strict';

import * as vscode from 'vscode';
import {ccAnnotateLens} from './annotateLens';

export type Commands = 'extension.ccAnnotate';

export const Commands = {
	ShowAnnotation: "extension.ccAnnotate" as Commands
}

export class CcCodeLensProvider implements vscode.CodeLensProvider
{
	static selector = {
		scheme: "file"
	};

	private m_context:vscode.ExtensionContext;

	public constructor(context: vscode.ExtensionContext)
	{
		this.m_context = context;
	}

	async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]>
	{
		let l_lenses: vscode.CodeLens[] = [];

		l_lenses.push(new ccAnnotateLens(document, new vscode.Range(0,0,0,1)));

		return l_lenses;
	}

	public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): Thenable<vscode.CodeLens>
	{
		if( codeLens instanceof ccAnnotateLens )
			return this.ccAnnotationCommand(codeLens, token);

		return Promise.reject<vscode.CodeLens>(undefined);
	}

	private ccAnnotationCommand(iLens: ccAnnotateLens, iToken: vscode.CancellationToken)
	{
		iLens.command = {
			title: "Show annotations",
			command: "extension.ccAnnotate",
			arguments: [iLens.document.uri]
		};
		return Promise.resolve(iLens);
	}
}
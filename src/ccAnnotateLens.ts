'use strict';

import * as vscode from 'vscode';

export class CCAnnotateLens extends vscode.CodeLens
{
	constructor(public document: vscode.TextDocument, range: vscode.Range)
	{
		super(range);
	}
}
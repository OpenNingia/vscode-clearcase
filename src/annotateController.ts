'use strict';

import * as vscode from 'vscode';
import {ClearCase} from './clearcase'

export class ccAnnotationController
{
	private decorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({
		before: {
			margin: '0 1em 0 0'
		},
		after: {
			margin: '0 0 0 1em'
		}
	} as vscode.DecorationRenderOptions);

	private m_isActive: boolean;

	constructor(private cc: ClearCase, private editor: vscode.TextEditor, private context: vscode.ExtensionContext)
	{
		this.m_isActive = false;
		vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChange, this, this.context.subscriptions);
	}

	onActiveEditorChange(event:vscode.TextEditor)
	{
		if(event)
		{
			this.m_isActive = false;
			this.editor = event;
		}
	}

	setAnnotationInText(annotationText: string)
	{
		if( this.m_isActive === false )
		{
			let textLines = annotationText.split(/[\n\r]+/);
			textLines = textLines.map( l => {
				let parts = l.split(" | ");
				return parts[0];
			});

			let deco = this.getDecoration(textLines);
			this.editor.setDecorations(this.decorationType, deco);
			this.m_isActive = true;
		}
		else
		{
			this.editor.setDecorations(this.decorationType, []);
			this.m_isActive = false;
		}
	}

	getDecoration(lines:string[]): vscode.DecorationOptions[]
	{
		let max: number = 0;
		lines.forEach(l => {
			if( l.length > max )
				max = l.length;
		});
		max *= 0.55;

		return lines.map((line, index) => {
			return {
			hoverMessage: "",
			range: vscode.window.activeTextEditor.document.validateRange(new vscode.Range(index, 0, index, 1000)),
			renderOptions: {
				before:{
					color: "rgba(200,180, 90, 0.8)",
					backgroundColor: "rgba(20,20, 20, 0.3)",
					width: `${max}em`,
					contentText: line
				}
			}
		} as vscode.DecorationOptions});
	}

	dispose()
	{

	}
}
'use strict';

import * as vscode from 'vscode';
import {ClearCase} from './clearcase'
import {ccConfigHandler} from './ccConfigHandler';
import {ccConfiguration} from './ccConfiguration';

export class ccAnnotationController
{
	private m_decorationType: vscode.TextEditorDecorationType;
	private m_isActive: boolean;
	private m_configuration: ccConfiguration;

	constructor(private cc: ClearCase,
							private editor: vscode.TextEditor,
							private context: vscode.ExtensionContext,
							private configHandler: ccConfigHandler)
	{
		this.m_isActive = false;
		vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChange, this, this.context.subscriptions);
		this.configHandler.onDidChangeConfiguration(this.onConfigurationChanged, this);
		let ro: vscode.DecorationRenderOptions = {
			isWholeLine: false,
			before: {
				margin: '0 1em 0 0'
			},
			after: {
				margin: '0 0 0 1em'
			}
		};
		this.m_decorationType = vscode.window.createTextEditorDecorationType(ro);
		this.m_configuration = this.configHandler.configuration;
	}

	onActiveEditorChange(event:vscode.TextEditor)
	{
		if(event)
		{
			this.m_isActive = false;
			this.editor = event;
		}
	}

	onConfigurationChanged()
	{
		this.m_configuration = this.configHandler.configuration;
	}

	setAnnotationInText(annotationText: string)
	{
		let deco : vscode.DecorationOptions[] = [];
		if( this.m_isActive === false )
		{
			let textLines = annotationText.split(/[\n\r]+/);
			let textLineParts = textLines.map( l => {
				let parts = l.split(" | ");
				parts[0] = parts[0].replace(/\\/g, "/");
				return parts;
			});
			deco = this.getDecoration(textLineParts, annotationText);
			this.m_isActive = true;
		}
		else
		{
			this.m_isActive = false;
		}
		this.editor.setDecorations(this.m_decorationType, deco);
	}

	getDecoration(lines:string[][], text:string): vscode.DecorationOptions[]
	{
		let max: number = 0;
		let deco: vscode.DecorationOptions[] = [];
		for( let lineNr=0; lineNr<lines.length; lineNr++)
		{
			let line = lines[lineNr][0].replace(/ /gi, '\u00A0');
			deco.push(this.createLineDecoration(line, lineNr, 0, max));
		}
		return deco;
	}

	private createLineDecoration(iLinePart:string, iLineNr:number, iCharStart: number, iWidth): vscode.DecorationOptions
	{
		let charLen = iLinePart.length;
		return {
			hoverMessage: "",
			range: vscode.window.activeTextEditor.document.validateRange(new vscode.Range(iLineNr, iCharStart, iLineNr, charLen)),
			renderOptions: {
				before:{
					color: this.m_configuration.AnnotationColor,
					backgroundColor: this.m_configuration.AnnotationBackground,
					contentText: iLinePart
				}
			}
		}
	}

	dispose()
	{

	}
}
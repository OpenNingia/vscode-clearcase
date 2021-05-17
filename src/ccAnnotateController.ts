'use strict';

import * as vscode from 'vscode';
import { ClearCase } from './clearcase'
import { ccConfigHandler } from './ccConfigHandler';
import { ccConfiguration } from './ccConfiguration';

export class ccAnnotationController {
	private m_decorationType: vscode.TextEditorDecorationType;
	private m_isActive: boolean;
	private m_configuration: ccConfiguration;

	constructor(
		private editor: vscode.TextEditor,
		private context: vscode.ExtensionContext,
		private configHandler: ccConfigHandler) {
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

	onActiveEditorChange(event: vscode.TextEditor|undefined): any {
		if (event) {
			this.m_isActive = false;
			this.editor = event;
		}
	}

	onConfigurationChanged() {
		this.m_configuration = this.configHandler.configuration;
	}

	setAnnotationInText(annotationText: string) {
		let deco: vscode.DecorationOptions[] = [];
		let maxWidth: number = 0;
		if (this.m_isActive === false) {
			let textLines = annotationText.split(/[\n\r]+/);
			let textLineParts = textLines.map(l => {
				let parts = l.split(" | ");
				parts[0] = parts[0].replace(/\\/g, "/");
				if (parts[0].length > maxWidth)
					maxWidth = parts[0].length;
				return parts;
			});
			deco = this.getDecoration(textLineParts, maxWidth);
			this.m_isActive = true;
		}
		else {
			this.m_isActive = false;
		}
		this.editor.setDecorations(this.m_decorationType, deco);
	}

	getDecoration(iLines: string[][], iMaxWidth: number): vscode.DecorationOptions[] {
		let max: number = 0;
		let deco: vscode.DecorationOptions[] = [];
		for (let lineNr = 0; lineNr < iLines.length; lineNr++) {
			let line = iLines[lineNr][0].replace(/ /gi, '\u00A0');
			while (line.length < iMaxWidth) {
				line = line.concat('\u00A0');
			}
			deco.push(this.createLineDecoration(line, lineNr, 0, max));
		}
		return deco;
	}

	private createLineDecoration(iLinePart: string, iLineNr: number, iCharStart: number, iWidth: number): vscode.DecorationOptions {
		let charLen = iLinePart.length;
		let range = vscode.window.activeTextEditor?.document.validateRange(new vscode.Range(iLineNr, iCharStart, iLineNr, charLen));
		if( range === undefined ) {
			range = new vscode.Range(0,0,0,0);
		}
		return {
			hoverMessage: "",
			range: range,
			renderOptions: {
				before: {
					color: this.m_configuration.AnnotationColor.Value,
					backgroundColor: this.m_configuration.AnnotationBackground.Value,
					contentText: iLinePart
				}
			}
		}
	}

	dispose() {

	}
}
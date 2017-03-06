'use strict'

import * as vscode from 'vscode';
import {exec} from 'child_process';

export class UIInformation
{
	private m_statusbar: vscode.StatusBarItem;
	private m_isActive: boolean;

	public constructor(private m_context: vscode.ExtensionContext,
										 private m_editor: vscode.TextEditor)
	{
		this.m_isActive = true;
		this.handleConfigState();
	}

	public createStatusbarItem()
	{
		this.m_statusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	}

	public bindEvents()
	{
		// configuration change event
		vscode.workspace.onDidChangeConfiguration(() => {
			this.handleConfigState();
		}, this, this.m_context.subscriptions);

		if( this.m_editor )
		{
			this.m_context.subscriptions.push(
				vscode.workspace.onDidOpenTextDocument(
					this.receiveDocument, this, this.m_context.subscriptions));
			this.m_context.subscriptions.push(
				vscode.workspace.onDidSaveTextDocument(
					this.receiveDocument, this, this.m_context.subscriptions));
			this.m_context.subscriptions.push(
				vscode.window.onDidChangeActiveTextEditor(
					this.receiveEditor, this, this.m_context.subscriptions));
			this.m_context.subscriptions.push(
				vscode.window.onDidChangeTextEditorViewColumn(
					this.receiveEditorColumn, this, this.m_context.subscriptions));
		}
	}

	public receiveEditorColumn(event:vscode.TextEditorViewColumnChangeEvent)
	{
		if( event && this.m_isActive )
		{
			this.m_editor = event.textEditor;
			this.queryVersionInformation(this.m_editor.document.fileName);
		}
	}

	public receiveDocument(event:vscode.TextDocument)
	{
		if( event && this.m_isActive )
		{
			this.queryVersionInformation(event.fileName);
		}
	}

	public receiveEditor(event:vscode.TextEditor)
	{
		if( event && this.m_isActive )
		{
			this.m_editor = event;
			this.queryVersionInformation(event.document.fileName);
		}
	}

	private handleConfigState()
	{
		let config = vscode.workspace.getConfiguration('vscode-clearcase');
		if( config && config.has("showVersionInStatusbar") )
		{
			this.m_isActive = config.get("showVersionInStatusbar") as boolean;
		}

		if( this.m_isActive === false )
		{
			this.m_statusbar.hide();
		}
		else
		{
			this.initialQuery();
		}
	}

	public initialQuery()
	{
		if( this.m_isActive && this.m_editor && this.m_editor.document )
		{
			this.queryVersionInformation(this.m_editor.document.fileName);
		}
	}

	public queryVersionInformation(iFile:string)
	{
		exec("cleartool ls -short \"" + iFile + "\"", (error, stdout, stderr) => {
			if(error || stderr)
			{
				this.updateStatusbar("");
			}
			else
			{
				if(stdout)
				{
					this.updateStatusbar(stdout);
				}
			}
		});
	}

	public updateStatusbar(iFileInfo:string)
	{
		if( iFileInfo !== undefined && iFileInfo !== null && iFileInfo !== "" )
		{
			let res = iFileInfo.split("@@");
			let version = "view private";
			if( res.length > 1 )
			{
				version = res[1].replace(/\\/g, "/").trim();
			}
			this.m_statusbar.text = "[" + version + "]";
			this.m_statusbar.show();
		}
		else
		{
			this.m_statusbar.hide();
		}
	}

	public dispose()
	{
		this.m_statusbar.dispose();
	}
}

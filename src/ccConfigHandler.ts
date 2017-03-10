'use strict';

import * as vscode from 'vscode';
import {ccConfiguration} from './ccConfiguration'

export class ccConfigHandler
{
	private context: vscode.ExtensionContext;
	private m_configChanged: vscode.EventEmitter<void>;
	private m_configuration: ccConfiguration;

	public constructor(context: vscode.ExtensionContext)
	{
		this.context = context;
		this.m_configChanged = new vscode.EventEmitter<void>();
		this.m_configuration = new ccConfiguration();
		vscode.workspace.onDidChangeConfiguration(this.handleChangedConfig, this, this.context.subscriptions)
	}

	get onDidChangeConfiguration(): vscode.Event<void>
	{
		return this.m_configChanged.event;
	}

	get configuration() : ccConfiguration
	{
		return this.m_configuration;
	}

	private handleChangedConfig(): void {
		let config = vscode.workspace.getConfiguration("vscode-clearcase");
		if( config )
		{
			if( config.has("showVersionInStatusbar") )
				this.m_configuration.ShowStatusbar = config.get("showVersionInStatusbar") as boolean;
			if( config.has("annotationColor") )
				this.m_configuration.AnnotationColor = config.get("annotationColor") as string;
			if( config.has("annotationBackgroundColor") )
				this.m_configuration.AnnotationBackground = config.get("annotationBackgroundColor") as string;
			this.m_configChanged.fire();
		}
	}
}
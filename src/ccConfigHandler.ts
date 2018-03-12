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

		this.loadConfig()

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

	private loadConfig(): boolean {
		let config = vscode.workspace.getConfiguration("vscode-clearcase");
		if( config )
		{
			if( config.has("showVersionInStatusbar") )
				this.m_configuration.ShowStatusbar = config.get("showVersionInStatusbar") as boolean;
			if( config.has("showAnnotationCodeLens") )
				this.m_configuration.ShowAnnotationCodeLens = config.get("showAnnotationCodeLens") as boolean;
			if( config.has("annotationColor") )
				this.m_configuration.AnnotationColor = config.get("annotationColor") as string;
			if( config.has("annotationBackgroundColor") )
				this.m_configuration.AnnotationBackground = config.get("annotationBackgroundColor") as string;
			if( config.has("annotationFormatString") )
				this.m_configuration.AnnotationFormatString = config.get("annotationFormatString") as string;
			if( config.has("useClearDlg") )
				this.m_configuration.UseClearDlg = config.get("useClearDlg") as boolean;
			if( config.has("checkoutCommandArgs") )
				this.m_configuration.CheckoutCommand = config.get("checkoutCommandArgs") as string;
			if( config.has("checkinCommandArgs") )
				this.m_configuration.CheckinCommand = config.get("checkinCommandArgs") as string;
			if( config.has("defaultComment") )
				this.m_configuration.DefaultComment = config.get("defaultComment") as string;
			return true;
		}
		return false;
	}
	private handleChangedConfig(): void {
		if( this.loadConfig() )
			this.m_configChanged.fire();
	}
}
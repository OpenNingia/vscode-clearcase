'use strict';

import * as vscode from 'vscode';
import { ccConfiguration, ConfigurationProperty } from './ccConfiguration'

export class ccConfigHandler {
	private m_configChanged: vscode.EventEmitter<string[]>;
	private m_configuration: ccConfiguration;
	private m_changeIdents: string[];

	public constructor(private context: vscode.ExtensionContext,
		private disposables: vscode.Disposable[]) {
		
		this.m_changeIdents = [];
		this.m_configChanged = new vscode.EventEmitter<string[]>();
		this.m_configuration = new ccConfiguration();

		this.loadConfig()

		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration(this.handleChangedConfig, this, this.context.subscriptions)
		);
	}

	get onDidChangeConfiguration(): vscode.Event<string[]> {
		return this.m_configChanged.event;
	}

	get configuration(): ccConfiguration {
		return this.m_configuration;
	}

	private loadConfig(): boolean {
		let config = vscode.workspace.getConfiguration("vscode-clearcase");
		if (config) {
			this.m_changeIdents = [];
			this.setChangeConfigDate<boolean>(config, "showVersionInStatusbar", this.m_configuration.ShowStatusbar);
			this.setChangeConfigDate<boolean>(config, "showAnnotationCodeLens", this.m_configuration.ShowAnnotationCodeLens);
			this.setChangeConfigDate<string>(config, "annotationColor", this.m_configuration.AnnotationColor);
			this.setChangeConfigDate<string>(config, "annotationBackgroundColor", this.m_configuration.AnnotationBackground);
			this.setChangeConfigDate<string>(config, "annotationFormatString", this.m_configuration.AnnotationFormatString);
			this.setChangeConfigDate<boolean>(config, "useClearDlg", this.m_configuration.UseClearDlg);
			this.setChangeConfigDate<string>(config, "checkoutCommandArgs", this.m_configuration.CheckoutCommand);
			this.setChangeConfigDate<string>(config, "findCheckoutsCommandArgs", this.m_configuration.FindCheckoutsCommand);
			this.setChangeConfigDate<string>(config, "checkinCommandArgs", this.m_configuration.CheckinCommand);
			this.setChangeConfigDate<string>(config, "defaultComment", this.m_configuration.DefaultComment);
			this.setChangeConfigDate<string>(config, "viewPrivateFileSuffixes", this.m_configuration.ViewPrivateFileSuffixes);
			this.setChangeConfigDate<string>(config, "executable", this.m_configuration.Executable);
			this.setChangeConfigDate<string>(config, "tempDir", this.m_configuration.TempDir);
			this.setChangeConfigDate<boolean>(config, "uncoKeepFile", this.m_configuration.UncoKeepFile);
			return true;
		}
		return false;
	}
	private handleChangedConfig(): void {
		if (this.loadConfig())
			this.m_configChanged.fire(this.m_changeIdents);
	}

	private setChangeConfigDate<T>(config: vscode.WorkspaceConfiguration, descriptor: string, configValue: ConfigurationProperty<T>): boolean {
		if (config.has(descriptor)) {
			configValue.Value = config.get(descriptor) as T;
			if (configValue.Changed) {
				this.m_changeIdents.push(descriptor);
				return true;
			}
		}
		return false;
	}
}
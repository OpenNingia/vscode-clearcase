'use strict';

import * as vscode from 'vscode';
import { CCConfiguration, ConfigurationProperty } from './ccConfiguration';

export class CCConfigHandler {
	private mConfigChanged: vscode.EventEmitter<string[]>;
	private mConfiguration: CCConfiguration;
	private mChangeIdents: string[];

	public constructor(private context: vscode.ExtensionContext,
		private disposables: vscode.Disposable[]) {
		
		this.mChangeIdents = [];
		this.mConfigChanged = new vscode.EventEmitter<string[]>();
		this.mConfiguration = new CCConfiguration();

		this.loadConfig();

		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration(this.handleChangedConfig, this, this.context.subscriptions)
		);
	}

	get onDidChangeConfiguration(): vscode.Event<string[]> {
		return this.mConfigChanged.event;
	}

	get configuration(): CCConfiguration {
		return this.mConfiguration;
	}

	private loadConfig(): boolean {
		let config = vscode.workspace.getConfiguration("vscode-clearcase");
		if (config) {
			this.mChangeIdents = [];
			this.setChangeConfigDate<boolean>(config, "showVersionInStatusbar", this.mConfiguration.showStatusbar);
			this.setChangeConfigDate<boolean>(config, "showAnnotationCodeLens", this.mConfiguration.showAnnotationCodeLens);
			this.setChangeConfigDate<string>(config, "annotationColor", this.mConfiguration.annotationColor);
			this.setChangeConfigDate<string>(config, "annotationBackgroundColor", this.mConfiguration.annotationBackground);
			this.setChangeConfigDate<string>(config, "annotationFormatString", this.mConfiguration.annotationFormatString);
			this.setChangeConfigDate<boolean>(config, "useClearDlg", this.mConfiguration.useClearDlg);
			this.setChangeConfigDate<string>(config, "checkoutCommandArgs", this.mConfiguration.checkoutCommand);
			this.setChangeConfigDate<string>(config, "findCheckoutsCommandArgs", this.mConfiguration.findCheckoutsCommand);
			this.setChangeConfigDate<string>(config, "checkinCommandArgs", this.mConfiguration.checkinCommand);
			this.setChangeConfigDate<string>(config, "defaultComment", this.mConfiguration.defaultComment);
			this.setChangeConfigDate<string>(config, "viewPrivateFileSuffixes", this.mConfiguration.viewPrivateFileSuffixes);
			this.setChangeConfigDate<string>(config, "executable", this.mConfiguration.executable);
			this.setChangeConfigDate<boolean>(config, "isWslEnv", this.mConfiguration.isWslEnv);
			this.setChangeConfigDate<string>(config, "tempDir", this.mConfiguration.tempDir);
			this.setChangeConfigDate<boolean>(config, "uncoKeepFile", this.mConfiguration.uncoKeepFile);
			return true;
		}
		return false;
	}
	private handleChangedConfig(): void {
		if (this.loadConfig()) {
			this.mConfigChanged.fire(this.mChangeIdents);
		}
	}

	private setChangeConfigDate<T>(config: vscode.WorkspaceConfiguration, descriptor: string, configValue: ConfigurationProperty<T>): boolean {
		if (config.has(descriptor)) {
			configValue.value = config.get(descriptor) as T;
			if (configValue.changed) {
				this.mChangeIdents.push(descriptor);
				return true;
			}
		}
		return false;
	}
}
"use strict";

import { Disposable, Event, EventEmitter, ExtensionContext, workspace, WorkspaceConfiguration } from "vscode";
import { CCConfiguration, ConfigurationProperty } from "./ccConfiguration";

export class CCConfigHandler {
  private mConfigChanged: EventEmitter<string[]>;
  private mConfiguration: CCConfiguration;
  private mChangeIdents: string[];

  public constructor(private context: ExtensionContext, private disposables: Disposable[]) {
    this.mChangeIdents = [];
    this.mConfigChanged = new EventEmitter<string[]>();
    this.mConfiguration = new CCConfiguration();

    this.loadConfig();

    this.disposables.push(
      workspace.onDidChangeConfiguration(this.handleChangedConfig, this, this.context.subscriptions)
    );
  }

  get onDidChangeConfiguration(): Event<string[]> {
    return this.mConfigChanged.event;
  }

  get configuration(): CCConfiguration {
    return this.mConfiguration;
  }

  private loadConfig(): boolean {
    let config = workspace.getConfiguration("vscode-clearcase");
    if (config) {
      this.mChangeIdents = [];
      this.setChangeConfigDate<boolean>(config, "showVersionInStatusbar", this.mConfiguration.showStatusbar);
      this.setChangeConfigDate<boolean>(
        config,
        "annotation.showAnnotationCodeLens",
        this.mConfiguration.showAnnotationCodeLens
      );
      this.setChangeConfigDate<string>(config, "annotation.color", this.mConfiguration.annotationColor);
      this.setChangeConfigDate<string>(config, "annotation.backgroundColor", this.mConfiguration.annotationBackground);
      this.setChangeConfigDate<string>(config, "annotation.formatString", this.mConfiguration.annotationFormatString);
      this.setChangeConfigDate<boolean>(config, "cleartool.useDialog", this.mConfiguration.useClearDlg);
      this.setChangeConfigDate<string>(
        config,
        "cleartool.checkoutCommandArguments",
        this.mConfiguration.checkoutCommand
      );
      this.setChangeConfigDate<string>(
        config,
        "cleartool.findCheckoutsCommandArguments",
        this.mConfiguration.findCheckoutsCommand
      );
      this.setChangeConfigDate<string>(config, "cleartool.checkinCommandArguments", this.mConfiguration.checkinCommand);
      this.setChangeConfigDate<string>(config, "cleartool.defaultComment", this.mConfiguration.defaultComment);
      this.setChangeConfigDate<string>(config, "viewPrivateFileSuffixes", this.mConfiguration.viewPrivateFileSuffixes);
      this.setChangeConfigDate<string>(config, "cleartool.executable", this.mConfiguration.executable);
      this.setChangeConfigDate<boolean>(config, "isWslEnvironment", this.mConfiguration.isWslEnv);
      this.setChangeConfigDate<string>(config, "tempDir", this.mConfiguration.tempDir);
      this.setChangeConfigDate<boolean>(config, "cleartool.undoCheckoutKeepFile", this.mConfiguration.uncoKeepFile);
      this.setChangeConfigDate<boolean>(config, "remoteCleartool.enable", this.mConfiguration.UseRemoteClient);
      this.setChangeConfigDate<string>(
        config,
        "remoteCleartool.webviewUsername",
        this.mConfiguration.WebserverUsername
      );
      this.setChangeConfigDate<string>(
        config,
        "remoteCleartool.webviewPassword",
        this.mConfiguration.WebserverPassword
      );
      this.setChangeConfigDate<string>(config, "remoteCleartool.webviewAddress", this.mConfiguration.WebserverAddress);

      return true;
    }
    return false;
  }
  private handleChangedConfig(): void {
    if (this.loadConfig()) {
      this.mConfigChanged.fire(this.mChangeIdents);
    }
  }

  private setChangeConfigDate<T>(
    config: WorkspaceConfiguration,
    descriptor: string,
    configValue: ConfigurationProperty<T>
  ): boolean {
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

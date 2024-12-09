"use strict";

import { Event, EventEmitter, workspace, WorkspaceConfiguration } from "vscode";
import { Configuration, PathMapping } from "./configuration";

import { IDisposable } from "../model";
import { LogLevel } from "../ui/output-channel";
import { ConfigurationProperty } from "./configuration-property";

export class ConfigurationHandler implements IDisposable {
  private mConfigChanged = new EventEmitter<string[]>();
  private mConfiguration = new Configuration();
  private mChangeIdents: string[] = [];
  private mDisposables: IDisposable[] = [];

  constructor() {
    // this.loadConfig();
    this.mDisposables.push(workspace.onDidChangeConfiguration(() => this.handleChangedConfig()));
    this.handleChangedConfig();
  }

  dispose(): void {
    this.mDisposables.forEach((d) => d.dispose());
  }

  get onDidChangeConfiguration(): Event<string[]> {
    return this.mConfigChanged.event;
  }

  get configuration(): Configuration {
    return this.mConfiguration;
  }

  private loadConfig(): boolean {
    const config = workspace.getConfiguration("vscode-clearcase");
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
      this.setChangeConfigDate<string>(
        config,
        "cleartool.findViewPrivateCommandArguments",
        this.mConfiguration.findViewPrivateCommand
      );
      this.setChangeConfigDate<string>(
        config,
        "cleartool.findHijackedCommandArguments",
        this.mConfiguration.findHijackedCommand
      );
      this.setChangeConfigDate<boolean>(config, "cleartool.showHijackedFiles", this.mConfiguration.showHijackedFiles);
      this.setChangeConfigDate<boolean>(
        config,
        "cleartool.showViewPrivateFiles",
        this.mConfiguration.showViewPrivateFiles
      );
      this.setChangeConfigDate<string>(config, "cleartool.checkinCommandArguments", this.mConfiguration.checkinCommand);
      this.setChangeConfigDate<string>(config, "cleartool.defaultComment", this.mConfiguration.defaultComment);
      this.setChangeConfigDate<string>(config, "viewPrivateFileSuffixes", this.mConfiguration.viewPrivateFileSuffixes);
      this.setChangeConfigDate<string>(config, "cleartool.executable", this.mConfiguration.executable);
      this.setChangeConfigDate<string>(config, "tempDir", this.mConfiguration.tempDir);
      this.setChangeConfigDate<boolean>(config, "cleartool.undoCheckoutKeepFile", this.mConfiguration.uncoKeepFile);
      this.setChangeConfigDate<boolean>(config, "remoteCleartool.enable", this.mConfiguration.useRemoteClient);
      this.setChangeConfigDate<string>(
        config,
        "remoteCleartool.webviewUsername",
        this.mConfiguration.webserverUsername
      );
      this.setChangeConfigDate<string>(
        config,
        "remoteCleartool.webviewPassword",
        this.mConfiguration.webserverPassword
      );
      this.setChangeConfigDate<string>(config, "remoteCleartool.webviewAddress", this.mConfiguration.webserverAddress);
      this.setChangeConfigDate<boolean>(config, "wsl.detectEnvironment", this.mConfiguration.detectWslEnvironment);
      this.setChangeConfigDate<PathMapping[]>(config, "wsl.pathMapping", this.mConfiguration.pathMapping);
      this.setChangeConfigDate<string>(config, "diffViewerEncoding", this.mConfiguration.diffViewEncoding);
      this.setChangeConfigDate<boolean>(config, "useLabelAtCheckin", this.mConfiguration.useLabelAtCheckin);
      this.setChangeConfigDate<LogLevel>(config, "logLevel", this.mConfiguration.logLevel);

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
        configValue.changed = true;
        this.mChangeIdents.push(descriptor);
        return true;
      }
    }
    return false;
  }
}

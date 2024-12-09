import {
  SourceControl,
  scm,
  Uri,
  commands,
  workspace,
  window,
  TextDocumentShowOptions,
  TextDocumentWillSaveEvent,
  TextDocumentSaveReason,
  ExtensionContext,
  languages,
  EventEmitter,
  Event,
  TextEditor,
  TextDocument,
  MessageItem,
  ProgressLocation,
} from "vscode";
import { ScmResource } from "../ui/scm-resource";
import { Clearcase } from "../clearcase/clearcase";
import { LocalizeFunc, loadMessageBundle } from "vscode-nls";
import { IDisposable } from "../model";
import { AnnotationLensProvider } from "./annotation-lens-provider";
import { ContentProvider } from "./content-provider";
import { unlink, statSync, access, existsSync, mkdirSync } from "fs";
import { Lock } from "../lock";
import { fromCcUri } from "../uri";

import * as path from "path";
import { getErrorMessage } from "../ui/errormessage";
import { VersionType } from "../clearcase/verstion-type";
import CcOutputChannel, { LogLevel } from "../ui/output-channel";
import UiControl from "../ui/ui-control";
import { ViewType } from "../clearcase/view-type";
import { AnnotationController } from "../annotation/annotation-controller";
import { ConfigurationHandler } from "../configuration/configuration-handler";
import { CheckoutGroup } from "../group/checkout-group";
import { ViewPrivateGroup } from "../group/view-private-group";
import { HijackedGroup } from "../group/hijacked-group";

const localize: LocalizeFunc = loadMessageBundle();

export class ClearcaseScmProvider implements IDisposable {
  private mContentProvider: ContentProvider | null = null;
  private mClearcase: Clearcase | null = null;
  private mScm: SourceControl | null = null;
  private mCheckedoutGrp: CheckoutGroup | null = null;
  private mUntrackedGrp: ViewPrivateGroup | null = null;
  private mHijackedGrp: HijackedGroup | null = null;
  private mIsUpdatingUntracked = false;
  private mIsUpdatingHijacked = false;
  private mListLock: Lock | null = null;
  private mDisposables: IDisposable[] = [];
  private mVersion = "0.0.0";

  private mWindowChangedEvent: EventEmitter<boolean> = new EventEmitter<boolean>();

  get root(): Uri | undefined {
    if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
      return workspace.workspaceFolders[0].uri;
    }
    return undefined;
  }

  constructor(
    private mContext: ExtensionContext,
    private outputChannel: CcOutputChannel,
    private configHandler: ConfigurationHandler
  ) {
    this.configHandler.onDidChangeConfiguration(async () => {
      if (this.configHandler.configuration.logLevel.changed) {
        this.outputChannel.logLevel = this.configHandler.configuration.logLevel.value;
      }
      if (this.configHandler.configuration.showHijackedFiles.changed) {
        this.mHijackedGrp?.updateResourceGroup();
        await this.mHijackedGrp?.createList();
      }
      if (this.configHandler.configuration.showViewPrivateFiles.changed) {
        this.mUntrackedGrp?.updateResourceGroup();
        await this.mUntrackedGrp?.createList();
      }
      this.updateContextResources(window.activeTextEditor !== undefined);
    });
    outputChannel.logLevel = this.configHandler.configuration.logLevel.value;
  }

  async init(): Promise<boolean> {
    this.mListLock = new Lock(1);
    this.mClearcase = new Clearcase(this.configHandler, this.outputChannel);
    if (this.configHandler.configuration.useRemoteClient.value === true) {
      if (this.configHandler.configuration.webserverPassword.value !== "") {
        if (this.clearcase) {
          this.clearcase.password = this.configHandler.configuration.webserverPassword.value;
          await this.clearcase.loginWebview();
          try {
            return await this.startExtension();
          } catch {
            return false;
          }
        }
      } else {
        const password = await window.showInputBox({
          password: true,
          prompt: "Insert password for webview connection",
          ignoreFocusOut: true,
        });
        if (password === undefined || this.clearcase === null) {
          return false;
        } else {
          this.clearcase.password = password;
          await this.clearcase.loginWebview();
          try {
            return await this.startExtension();
          } catch {
            return false;
          }
        }
      }
    } else {
      try {
        return await this.startExtension();
      } catch {
        return false;
      }
    }
    return false;
  }

  private async startExtension(): Promise<boolean> {
    let isView = false;
    try {
      isView = (await this.mClearcase?.checkIsView(undefined)) ?? false;
    } catch {
      isView = false;
    }
    if (isView) {
      if (this.configHandler.configuration.detectWslEnvironment.value) {
        this.mClearcase?.detectIsWsl();
      }
      const d = this.clearcase ? this.clearcase.viewType === ViewType.Dynamic : false;
      commands.executeCommand("setContext", "vscode-clearcase:enabled", isView);
      commands.executeCommand("setContext", "vscode-clearcase:DynView", d);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.mVersion = this.mContext.extension?.packageJSON?.version as string;
      // delete cache if new version is used
      if (this.mVersion !== this.mContext.workspaceState.get("version", "") || process.env["VSCODE_DEBUG_MODE"]) {
        this.mContext.workspaceState.update("version", this.mVersion);
      }

      this.mScm = scm.createSourceControl("cc", "ClearCase", this.root);
      if (this.clearcase !== null) {
        this.mCheckedoutGrp = new CheckoutGroup(
          this.mScm.createResourceGroup("cc_checkedout", "Checked out"),
          this.clearcase
        );
        this.mUntrackedGrp = new ViewPrivateGroup(
          this.mScm.createResourceGroup("cc_untracked", "View private"),
          this.clearcase,
          this.configHandler
        );
        this.mHijackedGrp = new HijackedGroup(
          this.mScm.createResourceGroup("cc_hijacked", "Hijacked"),
          this.clearcase,
          this.configHandler
        );
      }

      this.mContentProvider = new ContentProvider(this.mClearcase);

      this.mDisposables.push(this.mScm);
      this.mDisposables.push(this.mContentProvider);

      this.mScm.inputBox.placeholder = "Message (press Ctrl+Enter to checkin all files)";
      this.mScm.acceptInputCommand = {
        command: "extension.ccCheckinAll",
        title: localize("checkinall", "Check In All"),
      };
      if (this.mContentProvider) {
        this.mScm.quickDiffProvider = this.mContentProvider;
      }

      this.clearcase?.onCommandExecuted((evArgs: Uri[]) => {
        this.handleChangeFiles(evArgs);
      });

      this.bindScmCommand();

      this.mIsUpdatingUntracked = false;

      this.mCheckedoutGrp?.createList();
      this.mUntrackedGrp?.createList();
      this.mHijackedGrp?.createList();

      this.onDidChangeTextEditor(window.activeTextEditor);

      let cfgTemp = this.configHandler.configuration.tempDir.value;
      if (this.mClearcase?.isRunningInWsl()) {
        cfgTemp = this.mClearcase.wslPath(cfgTemp);
      }
      if (!existsSync(cfgTemp)) {
        const userActions: MessageItem[] = [
          { title: "Create Directory" },
          { title: "Open Settings" },
          { title: "Ignore" },
        ];
        const userAction = await window.showInformationMessage(
          `The configured temp folder ${cfgTemp} does not exist. Do you want to created it or change the settings?`,
          ...userActions
        );

        switch (userAction?.title) {
          case userActions[0].title: {
            try {
              mkdirSync(cfgTemp);
            } catch (error) {
              window.showErrorMessage(`Could not create temp folder ${error}`);
            }
            break;
          }
          case userActions[1].title: {
            commands.executeCommand("workbench.action.openSettings", "@ext:openningia.vscode-clearcase tempDir");
            break;
          }
        }
      }

      return true;
    } else {
      return false;
    }
  }

  get clearcase(): Clearcase | null {
    return this.mClearcase;
  }

  async updateIsView(): Promise<boolean> {
    return this.clearcase?.checkIsView(window.activeTextEditor) ?? false;
  }

  updateContextResources(valid: boolean): void {
    const d = this.mClearcase ? this.mClearcase.viewType === ViewType.Dynamic : false;
    const files = this.getCheckedoutObjects();
    const hijackedFiles = this.getHijackedObjects();
    const viewPrivateFiles = this.getUntrackedObjects();
    commands.executeCommand("setContext", "vscode-clearcase:enabled", this.mClearcase?.isView);
    commands.executeCommand("setContext", "vscode-clearcase:DynView", d);
    commands.executeCommand("setContext", "vscode-clearcase:CheckedoutObjects", files);
    commands.executeCommand("setContext", "vscode-clearcase:HijackedObjects", hijackedFiles);
    commands.executeCommand("setContext", "vscode-clearcase:ViewPrivateObjects", viewPrivateFiles);
    commands.executeCommand("setContext", "vscode-clearcase:editor", valid);
  }

  private async handleChangeFiles(fileObjs: Uri[]) {
    if (this.mListLock?.reserve()) {
      for (const fileObj of fileObjs) {
        try {
          const version = (await this.clearcase?.getVersionInformation(fileObj)) ?? new VersionType();
          this.mCheckedoutGrp?.handleChangedFile(fileObj, version);
          // file is hijacked
          this.mHijackedGrp?.handleChangedFile(fileObj, version);
          // file is view private
          this.mUntrackedGrp?.handleChangedFile(fileObj, version);

          this.updateContextResources(window.activeTextEditor !== undefined);
        } catch (error) {
          this.outputChannel.appendLine(
            "Clearcase error: getVersionInformation: " + getErrorMessage(error),
            LogLevel.Error
          );
        }
      }
    }
    this.mListLock?.release();
  }

  private async handleDeleteFiles(fileObj: Uri) {
    this.mCheckedoutGrp?.handleDeleteFile(fileObj);
    this.mHijackedGrp?.handleDeleteFile(fileObj);
    this.mCheckedoutGrp?.handleDeleteFile(fileObj);
  }

  getCheckedoutObjects(): string[] | undefined {
    return this.mCheckedoutGrp?.getFileNamesList();
  }

  getUntrackedObjects(): string[] | undefined {
    return this.mUntrackedGrp?.getFileNamesList();
  }

  getHijackedObjects(): string[] | undefined {
    return this.mHijackedGrp?.getFileNamesList();
  }

  private async commandUpdateUntrackedList() {
    if (this.mIsUpdatingUntracked === false) {
      this.mIsUpdatingUntracked = true;
      await window.withProgress(
        {
          location: ProgressLocation.SourceControl,
          title: "Search untracked files",
          cancellable: false,
        },
        async (process) => {
          const lStep = 100;
          await this.mUntrackedGrp?.createList();

          process.report({
            message: `Searching view private files completed`,
            increment: lStep,
          });
          this.mIsUpdatingUntracked = false;
        }
      );
    }
  }

  private async commandUpdateHijackedFilesList() {
    if (this.mIsUpdatingHijacked === false) {
      this.mIsUpdatingHijacked = true;
      await window.withProgress(
        {
          location: ProgressLocation.SourceControl,
          title: "Search hijacked files",
          cancellable: false,
        },
        async (process) => {
          const lStep = 100;
          await this.mHijackedGrp?.createList();

          process.report({
            message: `Searching hijacked files completed`,
            increment: lStep,
          });
          this.mIsUpdatingHijacked = false;
        }
      );
    }
  }

  private deleteViewPrivateFile(fileObj: ScmResource) {
    const yes: MessageItem = { title: "Yes" };
    const no: MessageItem = { title: "No", isCloseAffordance: true };
    window
      .showInformationMessage(`Really delete file ${fileObj.resourceUri.fsPath}?`, { modal: true }, yes, no)
      .then((retVal: MessageItem | undefined) => {
        if (retVal !== undefined && retVal.title === yes.title) {
          access(fileObj.resourceUri.fsPath, (err) => {
            if (err === undefined) {
              unlink(fileObj.resourceUri.fsPath, (error) => {
                if (error) {
                  this.outputChannel.appendLine(`Delete error: ${error.message}`, LogLevel.Error);
                }
                this.handleDeleteFiles(fileObj.resourceUri);
              });
            }
          });
        }
      });
  }

  private async editConfigSpec() {
    if (workspace.workspaceFolders === undefined) {
      return;
    }
    const wsf = workspace.workspaceFolders[0].uri.fsPath;
    // create and configure input box:
    const saveInput = window.showInformationMessage("Save Configspec?", "Yes", "No");
    // Call cleartool:
    const child = await this.clearcase?.runClearTooledcs(wsf);
    // Callback on accept:
    saveInput.then((ev) => {
      let answer = "no";
      if (ev === "Yes") {
        answer = "yes";
      }
      child?.stdin?.write(answer);
      child?.stdin?.end();
    });
  }

  get onWindowChanged(): Event<boolean> {
    return this.mWindowChangedEvent.event;
  }

  bindCommands(): void {
    if (this.clearcase !== null) {
      this.registerCommand("extension.ccExplorer", (fileObj) => this.clearcase?.runClearCaseExplorer(fileObj));
      this.registerCommand("extension.ccCheckout", (fileObj) => this.clearcase?.checkoutFileAction(fileObj));
      this.registerCommand("extension.ccCheckin", (fileObj) => this.clearcase?.checkinFileAction(fileObj));
      this.registerCommand("extension.ccUndoCheckout", (fileObj) => this.clearcase?.undoCheckoutFileAction(fileObj));
      this.registerCommand("extension.ccVersionTree", (fileObj) => this.clearcase?.versionTree(fileObj));
      this.registerCommand("extension.ccComparePrevious", (fileObj) => this.clearcase?.diffWithPrevious(fileObj));
      this.registerCommand("extension.ccItemProperties", (fileObj) => this.clearcase?.itemProperties(fileObj));
      this.registerCommand("extension.ccMkElement", (fileObj) => this.clearcase?.createVersionedObject(fileObj));
      this.registerCommand("extension.ccHijack", (fileObj) => this.clearcase?.createHijackedObject(fileObj));
      this.registerCommand("extension.ccUndoHijack", (fileObj) => this.clearcase?.cancelHijackedObject(fileObj));
      this.registerCommand("extension.ccCompareWithVersion", (fileObj) => this.selectVersionAndCompare(fileObj));

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccOpenResource",
          (fileObj: Uri | ScmResource) => {
            let file: Uri | null = null;
            if (fileObj instanceof Uri) {
              file = fileObj;
            }
            if (fileObj instanceof ScmResource) {
              file = fileObj.resourceUri;
            }
            if (file === null) {
              if (window?.activeTextEditor) {
                file = window.activeTextEditor.document.uri;
              }
            }
            if (file !== null) {
              const st = statSync(file.fsPath);
              if (st.isDirectory() === false) {
                this.openResource(file);
              }
            }
          },
          this
        )
      );

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccEmbedDiff",
          (fileObj: Uri) => {
            this.embeddedDiff(fileObj);
          },
          this
        )
      );

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccFindModified",
          () => {
            if (workspace.workspaceFolders) {
              const path = workspace.workspaceFolders[0].uri.fsPath;
              if (path) {
                this.clearcase?.findModified(path);
              }
            }
          },
          this
        )
      );

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccFindCheckouts",
          () => {
            if (workspace.workspaceFolders) {
              const path = workspace.workspaceFolders[0].uri.fsPath;
              if (path) {
                this.clearcase?.findCheckoutsGui(path);
              }
            }
          },
          this
        )
      );
      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccFindViewPrivate",
          () => {
            this.clearcase?.findViewPrivate();
          },
          this
        )
      );

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccUpdateView",
          () => {
            this.clearcase?.updateView();
          },
          this
        )
      );

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccUpdateDir",
          (filePath?: Uri) => {
            if (window.activeTextEditor?.document && filePath) {
              this.clearcase?.updateDir(filePath);
            }
          },
          this
        )
      );

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccUpdateFile",
          (filePath?: Uri) => {
            if (window.activeTextEditor?.document && filePath) {
              this.clearcase?.updateFile(filePath);
            }
          },
          this
        )
      );

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccSelectActv",
          () => {
            this.clearcase?.changeCurrentActivity();
          },
          this
        )
      );

      if (window.activeTextEditor !== undefined) {
        const annoCtrl = new AnnotationController(window.activeTextEditor, this.configHandler);
        this.mDisposables.push(annoCtrl);

        this.mDisposables.push(
          commands.registerCommand(
            "extension.ccAnnotate",
            (filePath?: Uri) => {
              if (window.activeTextEditor?.document) {
                this.clearcase?.annotate(filePath ?? window.activeTextEditor.document.uri, annoCtrl);
              }
            },
            this
          )
        );
      }

      this.mDisposables.push(
        languages.registerCodeLensProvider(
          AnnotationLensProvider.selector,
          new AnnotationLensProvider(this.configHandler, this)
        )
      );
    }
  }

  private registerCommand(cmdName: string, cmd: (fileObj: Uri[]) => void) {
    this.mDisposables.push(
      commands.registerCommand(
        cmdName,
        (fileObj: Uri | ScmResource, additional?: Uri[] | ScmResource[]) => {
          let file: Uri | null = null;
          if (fileObj instanceof Uri) {
            file = fileObj;
          }
          if (fileObj instanceof ScmResource) {
            file = fileObj.resourceUri;
          }
          if (file === null) {
            if (window.activeTextEditor) {
              file = window.activeTextEditor.document.uri;
            }
          }
          let files: Uri[] = [];
          if (additional && additional?.length > 0) {
            files = additional.map((v: Uri | ScmResource) => {
              if (v instanceof Uri) {
                return v;
              }
              if (v instanceof ScmResource) {
                return v.resourceUri;
              }
              return Uri.parse("");
            });
          } else if (file !== null) {
            files.push(file);
          }
          if (files.length > 0) {
            cmd(files);
          }
        },
        this
      )
    );
  }

  private bindScmCommand() {
    this.mDisposables.push(
      commands.registerCommand(
        "extension.ccCheckinAll",
        () => {
          window.withProgress(
            {
              location: ProgressLocation.SourceControl,
              title: "Checkin all files",
              cancellable: false,
            },
            async (process) => {
              const fileObjs: Uri[] = this.mCheckedoutGrp?.getFileObjects() ?? [];
              if (this.mScm !== null) {
                const checkinComment = this.mScm.inputBox.value || "";
                await this.clearcase?.checkinFiles(fileObjs, checkinComment);
                this.mScm.inputBox.value = "";
                this.mCheckedoutGrp?.createList();
                process.report({ message: "Checkin finished." });
              }
            }
          );
        },
        this
      )
    );

    this.mDisposables.push(
      commands.registerCommand(
        "extension.ccCheckinSelected",
        (...resources: ScmResource[]) => {
          window.withProgress(
            {
              location: ProgressLocation.SourceControl,
              title: "Checkin all files",
              cancellable: false,
            },
            async (process) => {
              const fileObjs: Uri[] =
                resources?.map((val: ScmResource) => {
                  return val.resourceUri;
                }) ?? [];
              if (this.mScm !== null) {
                const checkinComment = this.mScm.inputBox.value || "";
                await this.clearcase?.checkinFiles(fileObjs, checkinComment);
                this.mScm.inputBox.value = "";
                this.mCheckedoutGrp?.createList();
                process.report({ message: "Checkin finished." });
              }
            }
          );
        },
        this
      )
    );

    this.mDisposables.push(
      commands.registerCommand(
        "extension.ccRefreshFileList",
        () => {
          this.mCheckedoutGrp?.createList();
        },
        this
      )
    );

    this.mDisposables.push(
      commands.registerCommand(
        "extension.ccRefreshViewPrivateFileList",
        () => {
          this.commandUpdateUntrackedList();
        },
        this
      )
    );

    this.mDisposables.push(
      commands.registerCommand(
        "extension.ccRefreshHijackedFileList",
        () => {
          this.commandUpdateHijackedFilesList();
        },
        this
      )
    );

    this.mDisposables.push(
      commands.registerCommand(
        "extension.ccDeleteViewPrivate",
        (fileObj: ScmResource) => {
          this.deleteViewPrivateFile(fileObj);
        },
        this
      )
    );

    this.mDisposables.push(
      commands.registerCommand(
        "extension.ccEditConfigSpec",
        () => {
          this.editConfigSpec();
        },
        this
      )
    );
  }

  bindEvents(): void {
    this.mDisposables.push(workspace.onWillSaveTextDocument((event) => this.onWillSaveDocument(event)));

    this.mDisposables.push(
      window.onDidChangeActiveTextEditor((event) => {
        this.outputChannel.appendLine("onDidChangeActiveTextEditor", LogLevel.Trace);
        this.onDidChangeTextEditor(event);
      })
    );
    this.mDisposables.push(
      window.onDidChangeWindowState((event) => {
        if (event.focused) {
          this.outputChannel.appendLine("OnDidChangeWindowState", LogLevel.Trace);
          this.onDidChangeTextEditor(window.activeTextEditor);
        }
      })
    );
  }

  private async onWillSaveDocument(event: TextDocumentWillSaveEvent) {
    try {
      if (event?.document === null || event.document.isUntitled || event.reason !== TextDocumentSaveReason.Manual) {
        return;
      }
      if (this.clearcase?.isReadOnly(event.document)) {
        const useClearDlg = this.configHandler.configuration.useClearDlg.value;
        if (useClearDlg) {
          this.clearcase.checkoutAndSaveFile(event.document);
        } else {
          this.clearcase.isClearcaseObject(event.document.uri).then((state: boolean) => {
            if (state === true) {
              this.clearcase
                ?.checkoutFile([event.document.uri])
                .then((isCheckedOut) => {
                  if (isCheckedOut === true) {
                    event.document.save();
                  }
                })
                .catch(() => {
                  return;
                });
            }
          });
        }
      } else {
        let version;
        try {
          version = (await this.clearcase?.getVersionInformation(event.document.uri)) ?? new VersionType();
        } catch (error) {
          this.outputChannel.appendLine(
            "Clearcase error: getVersionInformation: " + getErrorMessage(error),
            LogLevel.Error
          );
        }
        if (version?.version === "") {
          this.handleChangeFiles([event.document.uri]);
        }
      }
    } catch (error) {
      console.log("error " + getErrorMessage(error));
    }
  }

  private async openResource(fileObj: Uri) {
    if (window) {
      const doc: TextDocument = await workspace.openTextDocument(fileObj);
      window.showTextDocument(doc);
    }
  }

  private async embeddedDiff(fileObj: Uri, version?: string) {
    if (window) {
      const opts: TextDocumentShowOptions = {
        preview: true,
      };

      if (version) {
        fileObj = fileObj.with({ fragment: version });
      }

      const prevUri = await this.mContentProvider?.getOriginalResource(fileObj);
      if (prevUri !== undefined) {
        const fn = path.basename(fileObj.fsPath);
        const { version } = fromCcUri(prevUri);

        commands.executeCommand("vscode.diff", prevUri, fileObj, `${fn}@${version} <=> Current Version`, opts);
      }
    }
  }

  private async onDidChangeTextEditor(editor: TextEditor | undefined): Promise<void> {
    this.mContentProvider?.resetCache();
    this.mCheckedoutGrp?.createList();

    if (editor && this.clearcase && editor?.document.uri.scheme !== "output") {
      const version = await this.clearcase?.getVersionInformation(editor?.document.uri, true);
      this.mHijackedGrp?.handleChangedFile(editor?.document.uri, version);
      this.mUntrackedGrp?.handleChangedFile(editor.document.uri, version);
    }
    if (editor?.document.uri.scheme !== "output") {
      this.mWindowChangedEvent.fire(editor !== undefined);
    }
  }

  private async selectVersionAndCompare(file: Uri[]) {
    if (this.clearcase && file.length > 0) {
      const selVersion = await UiControl.showVersionSelectQuickpick(this.clearcase.getVersionsOfFile(file[0]));
      if (selVersion !== undefined && selVersion !== "") {
        this.embeddedDiff(file[0], selVersion);
      }
    }
  }

  get version(): string {
    return this.mVersion;
  }

  dispose(): void {
    this.mDisposables.forEach((d) => d.dispose());
    this.mDisposables = [];
  }
}

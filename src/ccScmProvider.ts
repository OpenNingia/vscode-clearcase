import {
  SourceControl,
  scm,
  SourceControlResourceGroup,
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
  SourceControlResourceState,
} from "vscode";
import { CCScmResource, ResourceGroupType } from "./ccScmResource";
import { CCScmStatus } from "./ccScmStatus";
import { ClearCase, ViewType } from "./clearcase";
import { LocalizeFunc, loadMessageBundle } from "vscode-nls";
import { IDisposable } from "./model";
import { CCConfigHandler } from "./ccConfigHandler";
import { CCAnnotationController } from "./ccAnnotateController";
import { CCCodeLensProvider } from "./ccAnnotateLensProvider";
import { CCContentProvider } from "./ccContentProvider";
import { unlink, statSync, access, existsSync, mkdirSync } from "fs";
import { Lock } from "./lock";
import { fromCcUri } from "./uri";

import * as path from "path";
import { getErrorMessage } from "./errormessage";
import { CCVersionState, CCVersionType } from "./ccVerstionType";
import CCOutputChannel, { LogLevel } from "./ccOutputChannel";
import CCUIControl from "./ccUIControl";

const localize: LocalizeFunc = loadMessageBundle();

export class CCScmProvider implements IDisposable {
  private mCCContentProvider: CCContentProvider | null = null;
  private mCCHandler: ClearCase | null = null;
  private mCCScm: SourceControl | null = null;
  private mCCCheckedoutGrp: SourceControlResourceGroup | null = null;
  private mCCUntrackedGrp: SourceControlResourceGroup | null = null;
  private mCCHijackedGrp: SourceControlResourceGroup | null = null;
  private mIsUpdatingUntracked = false;
  private mIsUpdatingHijacked = false;
  private mListLock: Lock | null = null;
  private mDisposables: IDisposable[] = [];
  private mVersion = "0.0.0";

  private mWindowChangedEvent: EventEmitter<void> = new EventEmitter<void>();

  get root(): Uri | undefined {
    if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
      return workspace.workspaceFolders[0].uri;
    }
    return undefined;
  }

  constructor(
    private mContext: ExtensionContext,
    private outputChannel: CCOutputChannel,
    private configHandler: CCConfigHandler
  ) {
    this.configHandler.onDidChangeConfiguration(() => {
      if (this.configHandler.configuration.logLevel.changed) {
        this.outputChannel.logLevel = this.configHandler.configuration.logLevel.value;
      }
    });
    outputChannel.logLevel = this.configHandler.configuration.logLevel.value;
  }

  async init(): Promise<boolean> {
    this.mListLock = new Lock(1);
    this.mCCHandler = new ClearCase(this.configHandler, this.outputChannel);
    if (this.configHandler.configuration.useRemoteClient.value === true) {
      if (this.configHandler.configuration.webserverPassword.value !== "") {
        if (this.clearCase) {
          this.clearCase.password = this.configHandler.configuration.webserverPassword.value;
          await this.clearCase.loginWebview();
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
        if (password === undefined || this.clearCase === null) {
          return false;
        } else {
          this.clearCase.password = password;
          await this.clearCase.loginWebview();
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
      isView = (await this.mCCHandler?.checkIsView(undefined)) ?? false;
    } catch {
      isView = false;
    }
    if (isView) {
      if (this.configHandler.configuration.detectWslEnvironment.value) {
        this.mCCHandler?.detectIsWsl();
      }
      const d = this.clearCase ? this.clearCase.viewType === ViewType.Dynamic : false;
      commands.executeCommand("setContext", "vscode-clearcase:enabled", isView);
      commands.executeCommand("setContext", "vscode-clearcase:DynView", d);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.mVersion = this.mContext.extension?.packageJSON?.version as string;
      // delete cache if new version is used
      if (this.mVersion !== this.mContext.workspaceState.get("version", "") || process.env["VSCODE_DEBUG_MODE"]) {
        this.mContext.workspaceState.update("untrackedfilecache", "");
        this.mContext.workspaceState.update("version", this.mVersion);
      }
      const fileList = this.mContext.workspaceState.get("untrackedfilecache", []);
      this.clearCase?.untrackedList.parse(fileList);

      this.mCCScm = scm.createSourceControl("cc", "ClearCase", this.root);
      this.mCCCheckedoutGrp = this.mCCScm.createResourceGroup("cc_checkedout", "Checked out");
      this.mCCUntrackedGrp = this.mCCScm.createResourceGroup("cc_untracked", "View private");
      this.mCCHijackedGrp = this.mCCScm.createResourceGroup("cc_hijacked", "Hijacked");
      this.mCCCheckedoutGrp.hideWhenEmpty = true;
      this.mCCUntrackedGrp.hideWhenEmpty = true;
      this.mCCHijackedGrp.hideWhenEmpty = true;
      this.mCCContentProvider = new CCContentProvider(this.mCCHandler);

      this.mDisposables.push(this.mCCScm);
      this.mDisposables.push(this.mCCContentProvider);

      this.mCCScm.inputBox.placeholder = "Message (press Ctrl+Enter to checkin all files)";
      this.mCCScm.acceptInputCommand = {
        command: "extension.ccCheckinAll",
        title: localize("checkinall", "Check In All"),
      };
      if (this.mCCContentProvider) {
        this.mCCScm.quickDiffProvider = this.mCCContentProvider;
      }

      this.clearCase?.onCommandExecuted((evArgs: Uri[]) => {
        this.handleChangeFiles(evArgs);
      });

      this.bindScmCommand();

      this.mIsUpdatingUntracked = false;

      this.updateCheckedOutList();
      this.createHijackedList();
      this.createViewPrivateList();

      this.onDidChangeTextEditor(window.activeTextEditor);

      let cfgTemp = this.configHandler.configuration.tempDir.value;
      if (this.mCCHandler?.isRunningInWsl()) {
        cfgTemp = this.mCCHandler.wslPath(cfgTemp);
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

  get clearCase(): ClearCase | null {
    return this.mCCHandler;
  }

  async updateIsView(): Promise<boolean> {
    return this.clearCase?.checkIsView(window.activeTextEditor) ?? false;
  }

  updateContextResources(): void {
    const d = this.mCCHandler ? this.mCCHandler.viewType === ViewType.Dynamic : false;
    const files = this.getCheckedoutObjects();
    const hijackedFiles = this.getHijackedObjects();
    commands.executeCommand("setContext", "vscode-clearcase:enabled", this.mCCHandler?.isView);
    commands.executeCommand("setContext", "vscode-clearcase:DynView", d);
    commands.executeCommand("setContext", "vscode-clearcase:CheckedoutObjects", files);
    commands.executeCommand("setContext", "vscode-clearcase:HijackedObjects", hijackedFiles);
  }

  private async handleChangeFiles(fileObjs: Uri[]) {
    if (this.mListLock?.reserve()) {
      for (const fileObj of fileObjs) {
        try {
          const version = (await this.clearCase?.getVersionInformation(fileObj)) ?? new CCVersionType();
          let checkoutsChanged = false;
          const filteredCheckedout =
            this.mCCCheckedoutGrp?.resourceStates.filter((item) => {
              if (item.resourceUri.fsPath !== fileObj.fsPath) {
                return true;
              }

              checkoutsChanged = true;
              return false;
            }) ?? [];
          // file is checked out, add to resource state list
          if (version?.version.match(/checkedout/i) !== null) {
            filteredCheckedout?.push(new CCScmResource(ResourceGroupType.Index, fileObj, CCScmStatus.Modified));
            checkoutsChanged = true;
          }
          // file is hijacked
          this.updateHijackedList(fileObj, version);
          // file is view private
          this.updateViewPrivateList(fileObj, version);
          if (checkoutsChanged) {
            if (this.mCCCheckedoutGrp !== null) {
              this.mCCCheckedoutGrp.resourceStates = filteredCheckedout?.sort((a, b) => CCScmResource.sort(a, b)) || [];
            }
          }
          this.updateContextResources();
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
    if (this.mCCCheckedoutGrp !== null && this.mCCUntrackedGrp) {
      this.mCCCheckedoutGrp.resourceStates = this.mCCCheckedoutGrp.resourceStates.filter(
        (item) => item.resourceUri.fsPath !== fileObj.fsPath
      );

      this.mCCUntrackedGrp.resourceStates = this.mCCUntrackedGrp.resourceStates.filter(
        (item) => item.resourceUri.fsPath !== fileObj.fsPath
      );
    }
  }

  private async updateCheckedOutList() {
    let checkedout: CCScmResource[] = [];

    this.clearCase?.findCheckouts().then((files) => {
      checkedout = files
        .map((val) => {
          return new CCScmResource(ResourceGroupType.Index, Uri.file(val), CCScmStatus.Modified);
        })
        .sort((val1, val2) => {
          return val1.resourceUri.fsPath.localeCompare(val2.resourceUri.fsPath);
        });
      if (this.mCCCheckedoutGrp) {
        this.mCCCheckedoutGrp.resourceStates = checkedout.sort((a, b) => CCScmResource.sort(a, b));
      }
      this.mIsUpdatingUntracked = false;
    });
  }

  private async createViewPrivateList() {
    let viewPrivate: CCScmResource[] = [];

    if (this.configHandler.configuration.showViewPrivateFiles.value) {
      this.clearCase?.findViewPrivate().then((files) => {
        viewPrivate = files
          .map((val) => {
            return new CCScmResource(ResourceGroupType.Index, Uri.file(val), CCScmStatus.Untracked);
          })
          .sort((val1, val2) => {
            return val1.resourceUri.fsPath.localeCompare(val2.resourceUri.fsPath);
          });
        if (this.mCCUntrackedGrp) {
          this.mCCUntrackedGrp.resourceStates = viewPrivate.sort((a, b) => CCScmResource.sort(a, b));
        }
      });
    }
  }

  private async createHijackedList() {
    let hijacked: CCScmResource[] = [];

    if (this.configHandler.configuration.showHijackedFiles.value) {
      this.clearCase?.findHijacked().then((files) => {
        hijacked = files
          .map((val) => {
            return new CCScmResource(ResourceGroupType.Index, Uri.file(val), CCScmStatus.Hijacked);
          })
          .sort((val1, val2) => {
            return val1.resourceUri.fsPath.localeCompare(val2.resourceUri.fsPath);
          });
        if (this.mCCHijackedGrp) {
          this.mCCHijackedGrp.resourceStates = hijacked.sort((a, b) => CCScmResource.sort(a, b));
        }
      });
    }
  }

  getCheckedoutObjects(): string[] | undefined {
    return this.mCCCheckedoutGrp?.resourceStates.map((value: SourceControlResourceState) => {
      return value.resourceUri.fsPath;
    });
  }

  getUntrackedObjects(): string[] | undefined {
    return this.mCCUntrackedGrp?.resourceStates.map((value: SourceControlResourceState) => {
      return value.resourceUri.fsPath;
    });
  }

  getHijackedObjects(): string[] | undefined {
    return this.mCCHijackedGrp?.resourceStates.map((value: SourceControlResourceState) => {
      return value.resourceUri.fsPath;
    });
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
          await this.createViewPrivateList();

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
          await this.createHijackedList();

          process.report({
            message: `Searching hijacked files completed`,
            increment: lStep,
          });
          this.mIsUpdatingHijacked = false;
        }
      );
    }
  }

  private deleteViewPrivateFile(fileObj: CCScmResource) {
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
    const child = await this.clearCase?.runClearTooledcs(wsf);
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

  get onWindowChanged(): Event<void> {
    return this.mWindowChangedEvent.event;
  }

  bindCommands(): void {
    if (this.clearCase !== null) {
      this.registerCommand("extension.ccExplorer", (fileObj) => this.clearCase?.runClearCaseExplorer(fileObj));
      this.registerCommand("extension.ccCheckout", (fileObj) => this.clearCase?.checkoutFileAction(fileObj));
      this.registerCommand("extension.ccCheckin", (fileObj) => this.clearCase?.checkinFileAction(fileObj));
      this.registerCommand("extension.ccUndoCheckout", (fileObj) => this.clearCase?.undoCheckoutFileAction(fileObj));
      this.registerCommand("extension.ccVersionTree", (fileObj) => this.clearCase?.versionTree(fileObj));
      this.registerCommand("extension.ccComparePrevious", (fileObj) => this.clearCase?.diffWithPrevious(fileObj));
      this.registerCommand("extension.ccItemProperties", (fileObj) => this.clearCase?.itemProperties(fileObj));
      this.registerCommand("extension.ccMkElement", (fileObj) => this.clearCase?.createVersionedObject(fileObj));
      this.registerCommand("extension.ccHijack", (fileObj) => this.clearCase?.createHijackedObject(fileObj));
      this.registerCommand("extension.ccUndoHijack", (fileObj) => this.clearCase?.cancelHijackedObject(fileObj));

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccOpenResource",
          (fileObj: Uri | CCScmResource) => {
            let file: Uri | null = null;
            if (fileObj instanceof Uri) {
              file = fileObj;
            }
            if (fileObj instanceof CCScmResource) {
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
          "extension.ccCompareWithVersion",
          (fileObj: Uri) => {
            if (fileObj === undefined || fileObj === null) {
              if (window?.activeTextEditor) {
                fileObj = window.activeTextEditor.document.uri;
              }
            }
            this.selectVersionAndCompare(fileObj);
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
                this.clearCase?.findModified(path);
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
                this.clearCase?.findCheckoutsGui(path);
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
            this.clearCase?.findViewPrivate();
          },
          this
        )
      );

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccUpdateView",
          () => {
            this.clearCase?.updateView();
          },
          this
        )
      );

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccUpdateDir",
          (filePath?: Uri) => {
            if (window.activeTextEditor?.document && filePath) {
              this.clearCase?.updateDir(filePath);
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
              this.clearCase?.updateFile(filePath);
            }
          },
          this
        )
      );

      this.mDisposables.push(
        commands.registerCommand(
          "extension.ccSelectActv",
          () => {
            this.clearCase?.changeCurrentActivity();
          },
          this
        )
      );

      if (window.activeTextEditor !== undefined) {
        const annoCtrl = new CCAnnotationController(window.activeTextEditor, this.configHandler);
        this.mDisposables.push(annoCtrl);

        this.mDisposables.push(
          commands.registerCommand(
            "extension.ccAnnotate",
            (filePath?: Uri) => {
              if (window.activeTextEditor?.document) {
                this.clearCase?.annotate(filePath ?? window.activeTextEditor.document.uri, annoCtrl);
              }
            },
            this
          )
        );
      }

      this.mDisposables.push(
        languages.registerCodeLensProvider(
          CCCodeLensProvider.selector,
          new CCCodeLensProvider(this.configHandler, this)
        )
      );
    }
  }

  private registerCommand(cmdName: string, cmd: (fileObj: Uri[]) => void) {
    this.mDisposables.push(
      commands.registerCommand(
        cmdName,
        (fileObj: Uri | CCScmResource, additional?: Uri[] | CCScmResource[]) => {
          let file: Uri | null = null;
          if (fileObj instanceof Uri) {
            file = fileObj;
          }
          if (fileObj instanceof CCScmResource) {
            file = fileObj.resourceUri;
          }
          if (file === null) {
            if (window.activeTextEditor) {
              file = window.activeTextEditor.document.uri;
            }
          }
          let files: Uri[] = [];
          if (additional && additional?.length > 0) {
            files = additional.map((v: Uri | CCScmResource) => {
              if (v instanceof Uri) {
                return v;
              }
              if (v instanceof CCScmResource) {
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
              const fileObjs: Uri[] =
                this.mCCCheckedoutGrp?.resourceStates.map((val) => {
                  return val.resourceUri;
                }) ?? [];
              if (this.mCCScm !== null) {
                const checkinComment = this.mCCScm.inputBox.value || "";
                await this.clearCase?.checkinFiles(fileObjs, checkinComment);
                this.mCCScm.inputBox.value = "";
                this.updateCheckedOutList();
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
        (...resources: CCScmResource[]) => {
          window.withProgress(
            {
              location: ProgressLocation.SourceControl,
              title: "Checkin all files",
              cancellable: false,
            },
            async (process) => {
              const fileObjs: Uri[] =
                resources?.map((val: CCScmResource) => {
                  return val.resourceUri;
                }) ?? [];
              if (this.mCCScm !== null) {
                const checkinComment = this.mCCScm.inputBox.value || "";
                await this.clearCase?.checkinFiles(fileObjs, checkinComment);
                this.mCCScm.inputBox.value = "";
                this.updateCheckedOutList();
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
          this.updateCheckedOutList();
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
        (fileObj: CCScmResource) => {
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
      if (this.clearCase?.isReadOnly(event.document)) {
        const useClearDlg = this.configHandler.configuration.useClearDlg.value;
        if (useClearDlg) {
          this.clearCase.checkoutAndSaveFile(event.document);
        } else {
          this.clearCase.isClearcaseObject(event.document.uri).then((state: boolean) => {
            if (state === true) {
              this.clearCase
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
          version = (await this.clearCase?.getVersionInformation(event.document.uri)) ?? new CCVersionType();
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

      const prevUri = await this.mCCContentProvider?.getOriginalResource(fileObj);
      if (prevUri !== undefined) {
        const fn = path.basename(fileObj.fsPath);
        const { version } = fromCcUri(prevUri);

        commands.executeCommand("vscode.diff", prevUri, fileObj, `${fn}@${version} <=> Current Version`, opts);
      }
    }
  }

  private async updateHijackedList(fileObj: Uri, version: CCVersionType): Promise<boolean> {
    if (this.configHandler.configuration.showHijackedFiles.value) {
      if (this.clearCase && this.mCCHijackedGrp) {
        const isHijacked = version.state === CCVersionState.Hijacked;
        let hijackedExists = false;
        const filteredHijacked =
          this.mCCHijackedGrp?.resourceStates.filter((item) => {
            if (item.resourceUri.fsPath === fileObj.fsPath) {
              hijackedExists = true;
              return isHijacked;
            }
            return true;
          }) ?? [];

        if (isHijacked) {
          if (this.clearCase.hijackedList.exists(fileObj.fsPath) === false) {
            this.clearCase.hijackedList.addString(fileObj.fsPath);
            this.mContext.workspaceState.update("hijackedfilecache", this.clearCase.hijackedList.stringify());
          }
          if (!hijackedExists) {
            filteredHijacked.push(new CCScmResource(ResourceGroupType.Index, fileObj, CCScmStatus.Hijacked));
          }
        }
        if ((isHijacked && !hijackedExists) || (!isHijacked && hijackedExists)) {
          this.mCCHijackedGrp.resourceStates = filteredHijacked?.sort((a, b) => CCScmResource.sort(a, b)) || [];
        }
        return true;
      }
    }
    return false;
  }

  private async updateViewPrivateList(fileObj: Uri, version: CCVersionType): Promise<boolean> {
    if (this.configHandler.configuration.showViewPrivateFiles.value) {
      if (this.clearCase && this.mCCUntrackedGrp) {
        const isPrivate = version.state === CCVersionState.Untracked;
        let privateExists = false;
        const filteredPrivate =
          this.mCCUntrackedGrp.resourceStates.filter((item) => {
            if (item.resourceUri.fsPath === fileObj.fsPath) {
              privateExists = true;
              return isPrivate;
            }
            return true;
          }) ?? [];

        if (isPrivate) {
          if (this.clearCase.untrackedList.exists(fileObj.fsPath) === false) {
            this.clearCase.untrackedList.addString(fileObj.fsPath);
            this.mContext.workspaceState.update("untrackedfilecache", this.clearCase.untrackedList.stringify());
          }
          if (!privateExists) {
            filteredPrivate.push(new CCScmResource(ResourceGroupType.Index, fileObj, CCScmStatus.Untracked));
          }
        }
        if ((isPrivate && !privateExists) || (!isPrivate && privateExists)) {
          this.mCCUntrackedGrp.resourceStates = filteredPrivate?.sort((a, b) => CCScmResource.sort(a, b)) || [];
        }
        return true;
      }
    }
    return false;
  }

  private async onDidChangeTextEditor(editor: TextEditor | undefined): Promise<void> {
    this.mCCContentProvider?.resetCache();
    this.updateCheckedOutList();
    if (editor && this.clearCase && editor?.document.uri.scheme !== "output") {
      const version = await this.clearCase?.getVersionInformation(editor?.document.uri, true);
      this.updateHijackedList(editor?.document.uri, version);
      this.updateViewPrivateList(editor.document.uri, version);
    }
    //if (editor?.document.uri.scheme !== "output") {
    //  if (editor?.document.uri) {
    //    this.updateUntrackedListWFile(editor.document.uri);
    //  }
    //  this.mWindowChangedEvent.fire();
    //}
  }

  private async selectVersionAndCompare(file: Uri) {
    if (this.clearCase) {
      const selVersion = await CCUIControl.showVersionSelectQuickpick(this.clearCase.getVersionsOfFile(file));
      if (selVersion !== undefined && selVersion !== "") {
        this.embeddedDiff(file, selVersion);
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

import {
  SourceControl,
  scm,
  SourceControlResourceGroup,
  Uri,
  OutputChannel,
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
import { IDisposable, ModelHandler } from "./model";
import { CCConfigHandler } from "./ccConfigHandler";
import { CCAnnotationController } from "./ccAnnotateController";
import { CCCodeLensProvider } from "./ccAnnotateLensProvider";
import { CCContentProvider } from "./ccContentProvider";
import { unlink, statSync, access, existsSync, mkdirSync } from "fs";
import { IgnoreHandler } from "./ccIgnoreHandler";
import { Lock } from "./lock";
import { fromCcUri } from "./uri";

import * as path from "path";
import { getErrorMessage } from "./errormessage";

const localize: LocalizeFunc = loadMessageBundle();

export class CCScmProvider implements IDisposable {
  private mCCContentProvider: CCContentProvider | null = null;
  private mCCHandler: ClearCase | null = null;
  private mIgnoreFileEv: ModelHandler | null = null;
  private mCCScm: SourceControl | null = null;
  private mCCCheckedoutGrp: SourceControlResourceGroup | null = null;
  private mCCUntrackedGrp: SourceControlResourceGroup | null = null;
  private mIsUpdatingUntracked: boolean | null = null;
  private mListLock: Lock | null = null;
  private mIgnores: IgnoreHandler | null = null;
  private mDisposables: IDisposable[] = [];

  private mWindowChangedEvent: EventEmitter<void> = new EventEmitter<void>();

  get root(): Uri | undefined {
    if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
      return workspace.workspaceFolders[0].uri;
    }
    return undefined;
  }

  constructor(
    private mContext: ExtensionContext,
    private outputChannel: OutputChannel,
    private configHandler: CCConfigHandler
  ) { }

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
          } catch (err) {
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
          } catch (err) {
            return false;
          }
        }
      }
    } else {
      try {
        return await this.startExtension();
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  private async startExtension(): Promise<boolean> {
    let isView = false;
    try {
      isView = (await this.mCCHandler?.checkIsView(undefined)) ?? false;
    } catch (error) {
      isView = false;
    }
    if (isView) {
      const d = this.clearCase ? this.clearCase.viewType === ViewType.dynamic : false;
      commands.executeCommand("setContext", "vscode-clearcase:enabled", isView);
      commands.executeCommand("setContext", "vscode-clearcase:DynView", d);

      const fileList = this.mContext.workspaceState.get("untrackedfilecache", []);
      this.clearCase?.untrackedList.parse(fileList);

      this.mCCScm = scm.createSourceControl("cc", "ClearCase", this.root);
      this.mCCCheckedoutGrp = this.mCCScm.createResourceGroup("cc_checkedout", "Checked out");
      this.mCCUntrackedGrp = this.mCCScm.createResourceGroup("cc_untracked", "View private");
      this.mCCCheckedoutGrp.hideWhenEmpty = true;
      this.mCCUntrackedGrp.hideWhenEmpty = true;
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

      this.mIgnoreFileEv = new ModelHandler();
      // this.mIgnores = new IgnoreHandler(this.mIgnoreFileEv);
      // this.mIgnores.onFilterRefreshed(() => this.filterUntrackedList());

      this.clearCase?.onCommandExecuted((evArgs: Uri[]) => {
        this.handleChangeFiles(evArgs);
      });

      this.bindScmCommand();

      this.mIsUpdatingUntracked = false;

      this.updateCheckedOutList();
      this.filterUntrackedList();

      const cfgTemp = this.configHandler.configuration.tempDir.value;

      if (!existsSync(cfgTemp)) {
        const userActions: MessageItem[] = [{ title: "Create Directory" }, { title: "Open Settings" }, { title: "Ignore" }];
        const userAction = await window.showInformationMessage(`The configured temp folder ${cfgTemp} does not exist. Do you want to created it or change the settings?`, ...userActions);

        switch (userAction?.title) {
          case userActions[0].title: {
            try {
              mkdirSync(cfgTemp);
            }
            catch (error) {
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

  private async handleChangeFiles(fileObjs: Uri[]) {
    let version = "";
    if (this.mListLock?.reserve()) {
      for (const fileObj of fileObjs) {
        try {
          version = (await this.clearCase?.getVersionInformation(fileObj)) ?? "";
          let checkoutsChanged = false;
          let untrackedChanged = false;
          let filteredUntracked: SourceControlResourceState[] = [];
          const filteredCheckedout =
            this.mCCCheckedoutGrp?.resourceStates.filter((item) => {
              if (item.resourceUri.fsPath !== fileObj.fsPath) {
                return true;
              }

              checkoutsChanged = true;
              return false;
            }) ?? [];
          if (checkoutsChanged === false) {
            filteredUntracked =
              this.mCCUntrackedGrp?.resourceStates.filter((item) => {
                if (item.resourceUri.fsPath !== fileObj.fsPath) {
                  return true;
                }

                untrackedChanged = true;
                return false;
              }) ?? [];
          }
          // file is checked out, add to resource state list
          if (version.match(/checkedout/i) !== null) {
            filteredCheckedout?.push(new CCScmResource(ResourceGroupType.index, fileObj, CCScmStatus.modified));
            checkoutsChanged = true;
          }
          // file has no version information, so it is view private
          if (version.includes("private") && this.clearCase !== null) {
            if (this.clearCase.untrackedList.exists(fileObj.fsPath) === false) {
              this.clearCase.untrackedList.addString(fileObj.fsPath);
              this.mContext.workspaceState.update("untrackedfilecache", this.clearCase.untrackedList.stringify());
            }
            const ign = this.mIgnores?.getFolderIgnore(path.dirname(fileObj.fsPath));
            if (ign !== null && ign?.ignore.ignores(fileObj.fsPath) === false) {
              filteredUntracked.push(new CCScmResource(ResourceGroupType.index, fileObj, CCScmStatus.untracked));
              untrackedChanged = true;
            }
          }
          if (checkoutsChanged) {
            if (this.mCCCheckedoutGrp !== null) {
              this.mCCCheckedoutGrp.resourceStates = filteredCheckedout?.sort((a, b) => CCScmResource.sort(a, b)) || [];
            }
          }
          if (untrackedChanged) {
            if (this.mCCUntrackedGrp !== null) {
              this.mCCUntrackedGrp.resourceStates = filteredUntracked?.sort((a, b) => CCScmResource.sort(a, b)) || [];
            }
          }
        } catch (error) {
          this.outputChannel.appendLine("Clearcase error: getVersionInformation: " + getErrorMessage(error));
        }
      }
    }
    this.mListLock?.release();
  }

  private async cleanUntrackedList() {
    this.clearCase?.untrackedList.updateEntryExistsOnFileSystem();
    this.clearCase?.untrackedList.cleanMap();
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
          return new CCScmResource(ResourceGroupType.index, Uri.file(val), CCScmStatus.modified);
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

  getCheckedoutObjects(): string[] | undefined {
    return this.mCCCheckedoutGrp?.resourceStates.map((value: SourceControlResourceState) => {
      return value.resourceUri.fsPath;
    });
  }

  private async updateUntrackedList() {
    await window.withProgress(
      {
        location: ProgressLocation.SourceControl,
        title: "Search untracked files",
        cancellable: false,
      },
      async (process) => {
        if (this.mIsUpdatingUntracked === false || this.clearCase !== null) {
          this.mIsUpdatingUntracked = true;
          this.clearCase?.untrackedList.resetFoundState();

          const lStep = 100;

          await this.clearCase?.findUntracked(this.root);
          process.report({
            message: `Folder ${this.root} checked!`,
            increment: lStep,
          });

          this.clearCase?.untrackedList.cleanMap();
          this.mContext.workspaceState.update("untrackedfilecache", this.clearCase?.untrackedList.stringify());
          this.filterUntrackedList();
          this.mIsUpdatingUntracked = false;
        }
      }
    );
  }

  private filterUntrackedList() {
    let viewPrv: CCScmResource[] = [];
    const root = this.root;
    if (root !== undefined) {
      const ign = this.mIgnores?.getFolderIgnore(root);
      const d = this.clearCase?.untrackedList.getStringsByKey(root?.fsPath)?.filter(
        (item) =>
          // if no .ccignore file is present, show all files
          root !== undefined &&
          (ign === undefined || (item !== "" && ign?.ignore.ignores(path.relative(root.fsPath, item)) === false))
      );
      if (d !== undefined) {
        viewPrv = viewPrv.concat(
          d.map((val) => {
            return new CCScmResource(ResourceGroupType.untracked, Uri.file(val), CCScmStatus.untracked);
          })
        );
        if (this.mCCUntrackedGrp !== null) {
          this.mCCUntrackedGrp.resourceStates = viewPrv.sort((a, b) => CCScmResource.sort(a, b));
        }
      }
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
                  this.outputChannel.appendLine(`Delete error: ${error.message}`);
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
            this.embedDiff(fileObj);
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
          this.updateUntrackedList();
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

    this.mDisposables.push(window.onDidChangeActiveTextEditor((event) => this.onDidChangeTextEditor(event)));
  }

  private async onWillSaveDocument(event: TextDocumentWillSaveEvent) {
    try {
      if (
        event === null ||
        event.document === null ||
        event.document.isUntitled ||
        event.reason !== TextDocumentSaveReason.Manual
      ) {
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
        let version = "";
        try {
          version = (await this.clearCase?.getVersionInformation(event.document.uri)) ?? "";
        } catch (error) {
          this.outputChannel.appendLine("Clearcase error: getVersionInformation: " + getErrorMessage(error));
        }
        if (version === "") {
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

  private async embedDiff(fileObj: Uri) {
    if (window) {
      const opts: TextDocumentShowOptions = {
        preview: true,
      };

      const prevUri = await this.mCCContentProvider?.getOriginalResource(fileObj);
      if (prevUri !== undefined) {
        const fn = path.basename(fileObj.fsPath);
        const { version } = fromCcUri(prevUri);

        commands.executeCommand("vscode.diff", prevUri, fileObj, `${fn} ${version} - (WorkingDir)`, opts);
      }
    }
  }

  private async updateUntrackedListWFile(fileObj: Uri) {
    const isCCObject = await this.clearCase?.isClearcaseObject(fileObj);
    if (isCCObject === false) {
      const wsf = workspace.getWorkspaceFolder(fileObj);
      if (wsf?.uri.fsPath) {
        this.clearCase?.untrackedList.addStringByKey(fileObj.fsPath, wsf.uri.fsPath);
      }
      this.mContext.workspaceState.update("untrackedfilecache", this.clearCase?.untrackedList.stringify());
      this.filterUntrackedList();
    }
  }

  private async onDidChangeTextEditor(editor: TextEditor | undefined): Promise<void> {
    this.updateCheckedOutList();
    if (editor?.document.uri.scheme !== "output") {
      if (editor?.document.uri) {
        this.updateUntrackedListWFile(editor.document.uri);
      }
      this.mWindowChangedEvent.fire();
    }
  }

  dispose(): void {
    this.mDisposables.forEach((d) => d.dispose());
    this.mDisposables = [];
  }
}

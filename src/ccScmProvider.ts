
import { SourceControl, scm, SourceControlResourceGroup, Uri, Disposable, OutputChannel, commands, Location, workspace, window, ViewColumn, TextDocumentShowOptions, TextDocumentWillSaveEvent, TextDocumentSaveReason, ExtensionContext, languages, EventEmitter, Event, TextEditor, SourceControlResourceThemableDecorations, UriHandler, TextDocument, MessageItem, WorkspaceFolder, ProgressLocation, Progress, SourceControlResourceState } from "vscode";
import { CCScmResource, ResourceGroupType } from "./ccScmResource";
import { CCScmStatus } from "./ccScmStatus";
import { ClearCase, ViewType } from "./clearcase";
import { LocalizeFunc, loadMessageBundle } from "vscode-nls";
import { Model, ModelHandler } from "./model";
import { CCConfigHandler } from "./ccConfigHandler";
import { CCAnnotationController } from "./ccAnnotateController";
import { CCCodeLensProvider } from "./ccAnnotateLensProvider";
import { CCContentProvider } from "./ccContentProvider";
import { unlink, exists, statSync, access } from "fs";
import { IgnoreHandler } from "./ccIgnoreHandler";
import { Lock } from "./lock";
import { fromCcUri } from "./uri";

import * as path from 'path';

const localize: LocalizeFunc = loadMessageBundle();

export class CCScmProvider {

  private mCCContentProvider: CCContentProvider|null = null;
  private mCCHandler: ClearCase|null = null;
  private mIgnoreFileEv: ModelHandler|null = null;
  private mCCScm: SourceControl|null = null;
  private mCCCheckedoutGrp: SourceControlResourceGroup|null = null;
  private mCCUntrackedGrp: SourceControlResourceGroup|null = null;
  private mIsUpdatingUntracked: boolean|null = null;
  private mListLock: Lock|null = null;
  private mIgnores: IgnoreHandler|null = null;

  private mWindowChangedEvent: EventEmitter<void> = new EventEmitter<void>();

  get root(): Uri|undefined {
    if( workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0)
    {
      return workspace.workspaceFolders[0].uri;
    }
    return undefined;
  }

  constructor(private mContext: ExtensionContext,
    private mDisposables: Disposable[],
    private outputChannel: OutputChannel,
    private configHandler: CCConfigHandler) {
  }

  public async init(): Promise<boolean> {
    return new Promise<boolean>(async (resolve, reject) => {
      this.mListLock = new Lock(1);
      this.mCCHandler = new ClearCase(this.mContext, this.configHandler, this.outputChannel);
      if( this.configHandler.configuration.UseRemoteClient.value === true ) {
        window.showInputBox({password:true,prompt:"Insert password for webview connection",ignoreFocusOut:true}).then(async (passwd:string|undefined) => {
          if( passwd === undefined || this.clearCase === null ) {
            reject(false);
          } else {
            this.clearCase.Password = passwd;
            await this.clearCase.loginWebview();
            try {
              resolve(await this.startExtension());
            } catch(err) {
              reject(false);
            }
          }
        });
      } else {
        try {
          resolve(await this.startExtension());
        } catch(err) {
          reject(false);
        }
      }
    });
  }

  public startExtension(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.mCCHandler?.checkIsView(undefined).then((is_view) => {
        if (is_view) {
          const d = this.clearCase ? this.clearCase.viewType==ViewType.dynamic : false;
          commands.executeCommand('setContext', 'vscode-clearcase:enabled', is_view);
          commands.executeCommand('setContext', 'vscode-clearcase:DynView', d);

          let fileList = this.mContext.workspaceState.get('untrackedfilecache', []);
          this.clearCase?.untrackedList.parse(fileList);

          this.mCCScm = scm.createSourceControl('cc', 'ClearCase');
          this.mCCCheckedoutGrp = this.mCCScm.createResourceGroup("cc_checkedout", "Checked out");
          this.mCCUntrackedGrp = this.mCCScm.createResourceGroup("cc_untracked", "View private");
          this.mCCCheckedoutGrp.hideWhenEmpty = true;
          this.mCCUntrackedGrp.hideWhenEmpty = true;
          this.mCCContentProvider = new CCContentProvider(this.mCCHandler);
          
          this.mContext.subscriptions.push(this.mCCScm);
          
          this.mCCScm.inputBox.placeholder = "Message (press Ctrl+Enter to checkin all files)";
          this.mCCScm.acceptInputCommand = { command: 'extension.ccCheckinAll', title: localize('checkinall', 'Check In All') };
          this.mCCScm.quickDiffProvider = this.mCCContentProvider;
          
          this.mIgnoreFileEv = new ModelHandler();
          this.mIgnoreFileEv.init();
          this.mIgnores = new IgnoreHandler(this.mIgnoreFileEv);
          this.mIgnores.onFilterRefreshed.event(() => {
            this.filterUntrackedList();
          }, this);

          this.clearCase?.onCommandExecuted((evArgs: Uri) => {
            this.handleChangeFiles(evArgs);
          });

          this.bindScmCommand();

          this.mIsUpdatingUntracked = false;

          this.updateCheckedOutList();
          this.filterUntrackedList();
          resolve(true);
        } else {
          resolve(false);
        }
      }).catch(() => {
        reject(false);
      });
    });
  }

  public get clearCase(): ClearCase|null {
    return this.mCCHandler;
  }

  public updateIsView(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.clearCase?.checkIsView(window.activeTextEditor).then(() => {
        const s = this.clearCase ? this.clearCase.isView : false;
        resolve(s);
      }).catch((error) => {
        reject(false);
      });
    });
  }

  public async handleChangeFiles(fileObj: Uri) {
    let version = "";
    if (this.mListLock?.reserve()) {
      try {
        version = this.clearCase ? await this.clearCase.getVersionInformation(fileObj) : '';
        let changed: boolean[] = [false, false];
        let filteredUntracked:CCScmResource[] = [];
        let filteredCheckedout:CCScmResource[] = (this.mCCCheckedoutGrp?.resourceStates.filter((val, index) => {
          if (val.resourceUri.fsPath !== fileObj.fsPath) {
            return val;
          } else {
            changed[0] = true;
          }
        }) as CCScmResource[]);
        if (changed[0] === false) {
          filteredUntracked = (this.mCCUntrackedGrp?.resourceStates.filter((val, index) => {
            if (val.resourceUri.fsPath !== fileObj.fsPath) {
              return val;
            } else {
              changed[1] = true;
            }
          }) as CCScmResource[]) || [];
        }
        // file is checked out, add to resource state list
        if (version.match(/checkedout/i) !== null) {
          filteredCheckedout?.push(new CCScmResource(ResourceGroupType.index, fileObj, CCScmStatus.modified));
          changed[0] = true;
        }
        // file has no version information, so it is view private
        if (version === "" && this.clearCase !== null) {
          if (this.clearCase.untrackedList.exists(fileObj.fsPath) === false) {
            this.clearCase.untrackedList.addString(fileObj.fsPath);
            this.mContext.workspaceState.update("untrackedfilecache", this.clearCase.untrackedList.stringify());
          }
          let ign = this.mIgnores?.getFolderIgnore(path.dirname(fileObj.fsPath));
          if (ign !== null && ign?.ignore.ignores(fileObj.fsPath) === false) {
            filteredUntracked.push(new CCScmResource(ResourceGroupType.index, fileObj, CCScmStatus.untracked));
            changed[1] = true;
          }
        }
        if (changed[0]) {
          if(this.mCCCheckedoutGrp !== null) {
            this.mCCCheckedoutGrp.resourceStates = filteredCheckedout?.sort(CCScmResource.sort)||[];
          }
        }
        if (changed[1]) {
          if(this.mCCUntrackedGrp !== null) {
            this.mCCUntrackedGrp.resourceStates = filteredUntracked?.sort(CCScmResource.sort)||[];
          }
        }
      }
      catch (error) {
        this.outputChannel.appendLine("Clearcase error: getVersionInformation: " + error);
      }
    }
    this.mListLock?.release();
  }

  public async cleanUntrackedList() {
    this.clearCase?.untrackedList.updateEntryExistsOnFileSystem();
    this.clearCase?.untrackedList.cleanMap();
  }

  public async handleDeleteFiles(fileObj: Uri) {
    if(this.mCCCheckedoutGrp !== null && this.mCCUntrackedGrp){
      let filtered = this.mCCCheckedoutGrp.resourceStates.filter((val) => {
        if (val.resourceUri.fsPath !== fileObj.fsPath) {
          return val;
        }
      });
      this.mCCCheckedoutGrp.resourceStates = filtered;
      filtered = this.mCCUntrackedGrp.resourceStates.filter((val) => {
        if (val.resourceUri.fsPath !== fileObj.fsPath) {
          return val;
        }
      });
      this.mCCUntrackedGrp.resourceStates = filtered;
    }
  }

  public async updateCheckedOutList() {
    let checkedout: CCScmResource[] = [];

    this.clearCase?.findCheckouts().then((files) => {
      checkedout = files.map((val) => {
        return new CCScmResource(ResourceGroupType.index, Uri.file(val), CCScmStatus.modified);
      }).sort((val1, val2) => {
        return (val1.resourceUri.fsPath.localeCompare(val2.resourceUri.fsPath));
      });
      if(this.mCCCheckedoutGrp) {
        this.mCCCheckedoutGrp.resourceStates = checkedout.sort(CCScmResource.sort);
      }
      this.mIsUpdatingUntracked = false;
    });
  }

  public getCheckedoutObjects() {
    return this.mCCCheckedoutGrp?.resourceStates.map((value:SourceControlResourceState) => {
      return value.resourceUri.fsPath;
    })
  }

  public async updateUntrackedList() {
    await window.withProgress(
      {
        location: ProgressLocation.SourceControl,
        title: 'Search untracked files',
        cancellable: false
      },
      async (process) => {
        if (this.mIsUpdatingUntracked === false || this.clearCase !== null) {
          this.mIsUpdatingUntracked = true;
          this.clearCase?.untrackedList.resetFoundState();
          
          let lStep = 100;

          await this.clearCase?.findUntracked(this.root);
          process.report({
            message: `Folder ${this.root} checked!`,
            increment: lStep
          });

          this.clearCase?.untrackedList.cleanMap();
          this.mContext.workspaceState.update("untrackedfilecache", this.clearCase?.untrackedList.stringify());
          this.filterUntrackedList();
          this.mIsUpdatingUntracked = false;
        }
      }
    );
  }

  public filterUntrackedList() {
    let viewPrv: CCScmResource[] = [];
    let root = this.root;
    if(root !== undefined) {
      let ign = this.mIgnores?.getFolderIgnore(root);
      let d = this.clearCase?.untrackedList.getStringsByKey(root?.fsPath)?.filter((val) => {
        // if no .ccignore file is present, show all files
        if (root!== undefined && (ign === undefined || (val !== "" && ign?.ignore.ignores(path.relative(root.fsPath, val)) === false))) {
          return val;
        }
      });
      if(d!== undefined) {
        viewPrv = viewPrv.concat(d.map((val) => {
          return new CCScmResource(ResourceGroupType.untracked, Uri.file(val), CCScmStatus.untracked);
        }));
        if(this.mCCUntrackedGrp!==null) {
          this.mCCUntrackedGrp.resourceStates = viewPrv.sort(CCScmResource.sort);
        }
      }
    }
  }

  public deleteViewPrivateFile(fileObj: CCScmResource) {
    let yes: MessageItem = { title: "Yes" };
    let no: MessageItem = { title: "No", isCloseAffordance: true };
    window.showInformationMessage(
      `Really delete file ${fileObj.resourceUri.fsPath}?`,
      { modal: true }, yes, no)
      .then((retVal: MessageItem|undefined) => {

        if (retVal !== undefined && retVal.title === yes.title) {
          access(fileObj.resourceUri.fsPath, ((err:any) => {
            if (err === undefined) {
              unlink(fileObj.resourceUri.fsPath, (error => {
                if (error) {
                  this.outputChannel.appendLine(`Delete error: ${error.message}`);
                }
                this.handleDeleteFiles(fileObj.resourceUri);
              }));
            }
          }));
        }
      });
  }

  public async editConfigSpec() {
    if( workspace.workspaceFolders === undefined ) {
      return;
    }
    let wsf = workspace.workspaceFolders[0].uri.fsPath;
    // create and configure input box:
    let saveInput = window.showInformationMessage("Save Configspec?", "Yes", "No");
    // Call cleartool:
    let child = await this.clearCase?.runClearTooledcs(wsf);
    // Callback on accept:
    saveInput.then((ev) => {
      let answer = 'no';
      if (ev === 'Yes') {
        answer = 'yes';
      }
      child?.stdin?.write(answer);
      child?.stdin?.end();
    });
  }

  public get onWindowChanged(): Event<void> {
    return this.mWindowChangedEvent.event;
  }

  public bindCommands() {
    if(this.clearCase !== null){

      this.registerCommand('extension.ccExplorer', this.clearCase.runClearCaseExplorer);
      this.registerCommand('extension.ccCheckout', this.clearCase.checkoutFile);
      this.registerCommand('extension.ccCheckin', this.clearCase.checkinFile);
      this.registerCommand('extension.ccUndoCheckout', this.clearCase.undoCheckoutFile);
      this.registerCommand('extension.ccVersionTree', this.clearCase.versionTree);
      this.registerCommand('extension.ccComparePrevious', this.clearCase.diffWithPrevious);
      this.registerCommand('extension.ccItemProperties', this.clearCase.itemProperties);
      this.registerCommand('extension.ccMkElement', this.clearCase.createVersionedObject);

      this.mDisposables.push(
        commands.registerCommand('extension.ccOpenResource', (fileObj: Uri | CCScmResource) => {
          let file: Uri|null = null;
          if (fileObj instanceof Uri) {
            file = fileObj;
          }
          if (fileObj instanceof CCScmResource) {
            file = fileObj.resourceUri;
          }
          if (file === null) {
            if (window && window.activeTextEditor) {
              file = window.activeTextEditor.document.uri;
            }
          }
          if (file !== null) {
            let st = statSync(file.fsPath);
            if (st.isDirectory() === false) {
              this.openResource(file);
            }
          }
        }, this)
      );

      this.mDisposables.push(
        commands.registerCommand('extension.ccEmbedDiff', (fileObj: Uri) => {
          this.embedDiff(fileObj);
        }, this)
      );

      this.mDisposables.push(
        commands.registerCommand('extension.ccFindModified', () => {
          if( workspace.workspaceFolders ) {
            var path = workspace.workspaceFolders[0].uri.fsPath;
            if (path) {
              this.clearCase?.findModified(path);
            }
          }
        }, this)
      );

      this.mDisposables.push(
        commands.registerCommand('extension.ccFindCheckouts', () => {
          if( workspace.workspaceFolders ) {
            var path = workspace.workspaceFolders[0].uri.fsPath;
            if (path) {
              this.clearCase?.findCheckoutsGui(path);
            }
          }
        }, this)
      );

      this.mDisposables.push(
        commands.registerCommand('extension.ccUpdateView', () => {
          this.clearCase?.updateView();
        }, this)
      );

      this.mDisposables.push(
        commands.registerCommand('extension.ccUpdateDir', (filePath?: Uri) => {
          if (window &&
              window.activeTextEditor &&
              window.activeTextEditor.document &&
              filePath) {
            this.clearCase?.updateDir(filePath);
          }
        }, this)
      );

      this.mDisposables.push(
        commands.registerCommand('extension.ccUpdateFile', (filePath?: Uri) => {
          if (window &&
              window.activeTextEditor &&
              window.activeTextEditor.document &&
              filePath) {
            this.clearCase?.updateFile(filePath);
          }
        }, this)
      );

      this.mDisposables.push(
        commands.registerCommand('extension.ccSelectActv', () => {
          this.clearCase?.changeCurrentActivity();
        }, this)
      );

      if( window.activeTextEditor !== undefined ) {
        let annoCtrl = new CCAnnotationController(
          window.activeTextEditor,
          this.mContext,
          this.configHandler);
          
        this.mContext.subscriptions.push(annoCtrl);
        this.mDisposables.push(
          commands.registerCommand('extension.ccAnnotate', (filePath?: Uri) => {
            if (window &&
              window.activeTextEditor &&
              window.activeTextEditor.document) {
              this.clearCase?.annotate(filePath || window.activeTextEditor.document.uri, annoCtrl);
            }
          }, this)
        );
      }

      this.mContext.subscriptions.push(
        languages.registerCodeLensProvider(
          CCCodeLensProvider.selector,
          new CCCodeLensProvider(this.mContext, this.configHandler, this)));
    }
  }

  public registerCommand(cmdName: string, cmd: (fileObj: Uri) => void) {
    this.mDisposables.push(
      commands.registerCommand(cmdName, (fileObj: Uri | CCScmResource) => {
        let file: Uri|null = null;
        if (fileObj instanceof Uri) {
          file = fileObj;
        }
        if (fileObj instanceof CCScmResource) {
          file = fileObj.resourceUri;
        }
        if (file === null) {
          if (window && window.activeTextEditor) {
            file = window.activeTextEditor.document.uri;
          }
        }
        if (file !== null) {
          this.clearCase?.execOnSCMFile(file, cmd);
        }
      }, this)
    );
  }

  public bindScmCommand() {
    this.mDisposables.push(
      commands.registerCommand('extension.ccCheckinAll', () => {
        window.withProgress({
          location: ProgressLocation.SourceControl,
          title: "Checkin all files",
          cancellable: false
        },
          async (process) => {
            let fileObjs: Uri[] = this.mCCCheckedoutGrp?.resourceStates.map(val => {
              return val.resourceUri;
            }) || [];
            if(this.mCCScm !== null) {
              let checkinComment = this.mCCScm.inputBox.value || "";
              await this.clearCase?.checkinFiles(fileObjs, checkinComment);
              this.mCCScm.inputBox.value = "";
              this.updateCheckedOutList();
              process.report({ message: "Checkin finished." });
            }
          });
      }, this));

    this.mDisposables.push(
      commands.registerCommand('extension.ccRefreshFileList', () => {
        this.updateCheckedOutList();
      }, this));

    this.mDisposables.push(
      commands.registerCommand('extension.ccRefreshViewPrivateFileList', () => {
        this.updateUntrackedList();
      }, this));

    this.mDisposables.push(
      commands.registerCommand('extension.ccDeleteViewPrivate', (fileObj: CCScmResource) => {
        this.deleteViewPrivateFile(fileObj);
      }, this));

    this.mDisposables.push(
      commands.registerCommand('extension.ccEditConfigSpec', () => {
        this.editConfigSpec();
      }, this));
  }

  public bindEvents() {
    this.mDisposables.push(
      workspace.onWillSaveTextDocument(this.onWillSaveDocument, this)
    );

    this.mDisposables.push(
      window.onDidChangeActiveTextEditor(this.onDidChangeTextEditor, this)
    );
  }

  public async onWillSaveDocument(event: TextDocumentWillSaveEvent) {
    try {
      if (event === null ||
        event.document === null ||
        event.document.isUntitled ||
        event.reason !== TextDocumentSaveReason.Manual) {
        return;
      }
      if (this.clearCase?.isReadOnly(event.document)) {

        let useClearDlg = this.configHandler.configuration.useClearDlg.value;
        if (useClearDlg) {
          this.clearCase.checkoutAndSaveFile(event.document);
        } else {
          this.clearCase.isClearcaseObject(event.document.uri).then((state: boolean) => {
            if (state === true) {
              this.clearCase?.checkoutFile(event.document.uri).then((isCheckedOut) => {
                if (isCheckedOut === true) {
                  event.document.save();
                }
              }).catch((error) => {
                return;
              });
            }
          });
        }
      }
      else {
        let version = "";
        try {
          version = this.clearCase ? await this.clearCase.getVersionInformation(event.document.uri) : "";
        }
        catch (error) {
          this.outputChannel.appendLine("Clearcase error: getVersionInformation: " + error);
        }
        if (version === "") {
          this.handleChangeFiles(event.document.uri);
        }
      }
    } catch (error) {
      console.log("error " + error);
    }
  }

  public async openResource(fileObj: Uri) {
    if (window) {
      let doc: TextDocument = await workspace.openTextDocument(fileObj);
      window.showTextDocument(doc);
    }
  }

  public async embedDiff(fileObj: Uri) {
    if (window) {

      const opts: TextDocumentShowOptions = {
        preview: true
      };

      let prevUri = await this.mCCContentProvider?.provideOriginalResource(fileObj);
      if (prevUri !== undefined) {
        let fn = path.basename(fileObj.fsPath);
        let { version } = fromCcUri(prevUri);

        commands.executeCommand('vscode.diff', prevUri, fileObj, `${fn} ${version} - (WorkingDir)`, opts);
      }
    }
  }

  public async updateUntrackedListWFile(fileObj: Uri) {
    let isCCObject = await this.clearCase?.isClearcaseObject(fileObj);
    if (isCCObject === false) {
      let wsf = workspace.getWorkspaceFolder(fileObj);
      if (wsf && wsf.uri && wsf.uri.fsPath) {
        this.clearCase?.untrackedList.addStringByKey(fileObj.fsPath, wsf.uri.fsPath);
      }
      this.mContext.workspaceState.update("untrackedfilecache", this.clearCase?.untrackedList.stringify());
      this.filterUntrackedList();
    }
  }

  public async onDidChangeTextEditor(editor: TextEditor|undefined): Promise<any> {
    await this.clearCase?.checkIsView(editor);
    this.updateCheckedOutList();
    if (editor && editor.document && editor.document.uri) {
      this.updateUntrackedListWFile(editor.document.uri);
    }
    this.mWindowChangedEvent.fire();
  }

  dispose(): void {
    this.mDisposables.forEach(d => d.dispose());
    this.mDisposables = [];
  }
}

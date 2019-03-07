
import { SourceControl, scm, SourceControlResourceGroup, Uri, Disposable, OutputChannel, commands, Location, workspace, window, ViewColumn, TextDocumentShowOptions, TextDocumentWillSaveEvent, TextDocumentSaveReason, ExtensionContext, languages, EventEmitter, Event, TextEditor, SourceControlResourceThemableDecorations, UriHandler, TextDocument, MessageItem, WorkspaceFolder, ProgressLocation, Progress } from "vscode";
import { ccScmResource, ResourceGroupType } from "./ccScmResource";
import { ccScmStatus } from "./ccScmStatus";
import { ClearCase } from "./clearcase";
import { LocalizeFunc, loadMessageBundle } from "vscode-nls";
import { Model, ModelHandler } from "./model";
import { ccConfigHandler } from "./ccConfigHandler";
import { ccAnnotationController } from "./ccAnnotateController";
import { ccCodeLensProvider } from "./ccAnnotateLensProvider";
import { ccContentProvider } from "./ccContentProvider";
import { join, dirname, basename } from "path";
import { unlink, exists } from "fs";
import { IgnoreHandler } from "./ccIgnoreHandler";
import { Lock } from "./lock";
import { fromCcUri } from "./uri";

const localize: LocalizeFunc = loadMessageBundle();

export class ccScmProvider {

  private m_ccContentProvider: ccContentProvider;
  private m_ccHandler: ClearCase;
  private m_ignoreFileEv: ModelHandler;
  private m_ccScm: SourceControl;
  private m_ccCheckedoutGrp: SourceControlResourceGroup;
  private m_ccUntrackedGrp: SourceControlResourceGroup;
  private m_isUpdatingUntracked: boolean;
  private m_listLock: Lock;
  private m_ignores: IgnoreHandler;

  private m_windowChangedEvent: EventEmitter<void>;

  constructor(private m_context: ExtensionContext,
    private m_disposables: Disposable[],
    private outputChannel: OutputChannel,
    private configHandler: ccConfigHandler) {

    this.m_listLock = new Lock(1);
    this.m_ccHandler = new ClearCase(m_context, configHandler, outputChannel);
    this.m_windowChangedEvent = new EventEmitter<void>();
    
    this.m_ccHandler.checkIsView(null).then((is_view) => {
      if (is_view) {
        this.m_ccScm = scm.createSourceControl('cc', 'ClearCase');
        this.m_ccCheckedoutGrp = this.m_ccScm.createResourceGroup("cc_checkedout", "Checked out");
        this.m_ccUntrackedGrp = this.m_ccScm.createResourceGroup("cc_untracked", "View private");
        this.m_ccCheckedoutGrp.hideWhenEmpty = true;
        this.m_ccUntrackedGrp.hideWhenEmpty = true;
        this.m_ccContentProvider = new ccContentProvider(this.m_ccHandler);
        
        this.m_context.subscriptions.push(this.m_ccScm);
        
        this.m_ccScm.inputBox.placeholder = "Message (press Ctrl+Enter to checkin all files)";
        this.m_ccScm.acceptInputCommand = { command: 'extension.ccCheckinAll', title: localize('checkinall', 'Check In All') };
        this.m_ccScm.quickDiffProvider = this.m_ccContentProvider;
        
        this.m_ignoreFileEv = new ModelHandler();
        this.m_ignoreFileEv.init();
        this.m_ignores = new IgnoreHandler(this.m_ignoreFileEv);
        this.m_ignores.OnFilterRefreshed.event(() => {
          this.filterUntrackedList();
        }, this);

        this.ClearCase.onCommandExecuted((evArgs: Uri) => {
          this.handleChangeFiles(evArgs);
        });

        this.bindScmCommand();

        this.m_isUpdatingUntracked = false;

        this.updateCheckedOutList();
      }
    });
  }

  public get ClearCase(): ClearCase {
    return this.m_ccHandler;
  }

  public updateIsView(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this.ClearCase.checkIsView(window.activeTextEditor).then(() => {
        resolve(this.ClearCase.IsView);
      }).catch((error) => {
        reject(false);
      });
    });
  }

  public async handleChangeFiles(fileObj: Uri) {
    let version = "";
    if (this.m_listLock.reserve()) {
      try {
        version = await this.ClearCase.getVersionInformation(fileObj);
        let changed: boolean[] = [false, false];
        let filteredUntracked = [];
        let filteredCheckedout = this.m_ccCheckedoutGrp.resourceStates.filter((val, index) => {
          if (val.resourceUri.fsPath !== fileObj.fsPath)
            return val;
          else
            changed[0] = true;
        });
        if (changed[0] == false) {
          filteredUntracked = this.m_ccUntrackedGrp.resourceStates.filter((val, index) => {
            if (val.resourceUri.fsPath !== fileObj.fsPath)
              return val;
            else
              changed[1] = true;
          });
        }
        // file is checked out, add to resource state list
        if (version.match(/checkedout/i) !== null) {
          filteredCheckedout.push(new ccScmResource(ResourceGroupType.Index, fileObj, ccScmStatus.MODIFIED));
          changed[0] = true;
        }
        // file has no version information, so it is view private
        if (version == "") {
          if( this.ClearCase.UntrackedList.exists(fileObj.fsPath) === false ) {
            this.ClearCase.UntrackedList.addString(fileObj.fsPath);
          }
          let ign = this.m_ignores.getFolderIgnore(dirname(fileObj.fsPath));
          if (ign !== null && ign.Ignore.ignores(fileObj.fsPath) === false) {
            filteredUntracked.push(new ccScmResource(ResourceGroupType.Index, fileObj, ccScmStatus.UNTRACKED));
            changed[1] = true;
          }
        }
        if (changed[0]) {
          this.m_ccCheckedoutGrp.resourceStates = filteredCheckedout.sort(ccScmResource.sort);
        }
        if (changed[1]) {
          this.m_ccUntrackedGrp.resourceStates = filteredUntracked.sort(ccScmResource.sort);
        }
      }
      catch (error) {
        this.outputChannel.appendLine("Clearcase error: getVersionInformation: " + error);
      }
    }
    this.m_listLock.release();
  }

  public async handleDeleteFiles(fileObj: Uri) {
    let filtered = this.m_ccCheckedoutGrp.resourceStates.filter((val) => {
      if (val.resourceUri.fsPath != fileObj.fsPath)
        return val;
    });
    this.m_ccCheckedoutGrp.resourceStates = filtered;
    filtered = this.m_ccUntrackedGrp.resourceStates.filter((val) => {
      if (val.resourceUri.fsPath != fileObj.fsPath)
        return val;
    });
    this.m_ccUntrackedGrp.resourceStates = filtered;
  }

  public async updateCheckedOutList() {
    let checkedout: ccScmResource[] = [];

    this.ClearCase.findCheckouts().then((files) => {
      checkedout = files.map((val) => {
        return new ccScmResource(ResourceGroupType.Index, Uri.file(val), ccScmStatus.MODIFIED);
      }).sort((val1, val2) => {
        return (val1.resourceUri.fsPath.localeCompare(val2.resourceUri.fsPath));
      });
      this.m_ccCheckedoutGrp.resourceStates = checkedout.sort(ccScmResource.sort);
      this.m_isUpdatingUntracked = false;
    });
  }

  public async updateUntrackedList() {
    await window.withProgress(
      {
        location: ProgressLocation.SourceControl,
        title: 'Search untracked files',
        cancellable: false
      },
      async (process) => {
        if (this.m_isUpdatingUntracked === false) {
          this.m_isUpdatingUntracked = true;
          let l_len = workspace.workspaceFolders.length;
          let l_step = ((l_len > 0) ? 100/l_len : 100);
          for (let i = 0; i < l_len; i++) {
            let root = workspace.workspaceFolders[i].uri;
            await this.ClearCase.findUntracked(root);
            process.report({
              message: `Folder ${root} checked!`,
              increment: (l_step*(1+i))
            });
          }
          this.filterUntrackedList();
          this.m_isUpdatingUntracked = false;
        }
      }
    );
  }

  public filterUntrackedList() {
    let viewPrv: ccScmResource[] = [];
    for (let i = 0; i < workspace.workspaceFolders.length; i++) {
      let root = workspace.workspaceFolders[i].uri;
      let ign = this.m_ignores.getFolderIgnore(root);
      let d = this.ClearCase.UntrackedList.getStringsByKey(root.fsPath).filter((val) => {
        if( ign !== null && ign.Ignore.ignores(val) === false )
        {
          return val;
        }
      });
      viewPrv = viewPrv.concat(d.map((val) => {
        return new ccScmResource(ResourceGroupType.Untracked, Uri.file(val), ccScmStatus.UNTRACKED);
      }));
    }
    this.m_ccUntrackedGrp.resourceStates = viewPrv.sort(ccScmResource.sort);
  }

  public deleteViewPrivateFile(fileObj: ccScmResource) {
    let yes: MessageItem = { title: "Yes" };
    let no: MessageItem = { title: "No", isCloseAffordance: true };
    window.showInformationMessage(
      `Really delete file ${fileObj.resourceUri.fsPath}?`,
      { modal: true }, yes, no)
      .then((retVal: MessageItem) => {

        if (retVal.title === yes.title) {
          exists(fileObj.resourceUri.fsPath, (exists => {
            if (exists === true)
              unlink(fileObj.resourceUri.fsPath, (error => {
                if (error)
                  this.outputChannel.appendLine(`Delete error: ${error.message}`);
                this.handleDeleteFiles(fileObj.resourceUri);
              }));
          }))
        }
      });
  }

  public get onWindowChanged(): Event<void> {
    return this.m_windowChangedEvent.event;
  }

  public bindCommands() {

    this.registerCommand('extension.ccExplorer', this.ClearCase.runClearCaseExplorer);
    this.registerCommand('extension.ccCheckout', this.ClearCase.checkoutFile);
    this.registerCommand('extension.ccCheckin', this.ClearCase.checkinFile);
    this.registerCommand('extension.ccUndoCheckout', this.ClearCase.undoCheckoutFile);
    this.registerCommand('extension.ccVersionTree', this.ClearCase.versionTree);
    this.registerCommand('extension.ccComparePrevious', this.ClearCase.diffWithPrevious);
    this.registerCommand('extension.ccItemProperties', this.ClearCase.itemProperties);

    this.m_disposables.push(
      commands.registerCommand('extension.ccOpenResource', (fileObj: Uri | ccScmResource) => {
        let file: Uri = null;
        if (fileObj instanceof Uri)
          file = fileObj;
        if (fileObj instanceof ccScmResource)
          file = fileObj.resourceUri;
        if (file === null) {
          if (window && window.activeTextEditor) {
            file = window.activeTextEditor.document.uri;
          }
        }
        if (file !== null) {
          this.openResource(file);
        }
      }, this)
    );

    this.m_disposables.push(
      commands.registerCommand('extension.ccEmbedDiff', (fileObj: Uri) => {
        this.embedDiff(fileObj);
      }, this)
    );

    this.m_disposables.push(
      commands.registerCommand('extension.ccFindModified', () => {
        var path = workspace.rootPath || workspace.workspaceFolders[0].uri.fsPath;
        if (path)
          this.ClearCase.findModified(path);
      }, this)
    );

    this.m_disposables.push(
      commands.registerCommand('extension.ccFindCheckouts', () => {
        var path = workspace.rootPath || workspace.workspaceFolders[0].uri.fsPath;
        if (path)
          this.ClearCase.findCheckoutsGui(path);
      }, this)
    );

    this.m_disposables.push(
      commands.registerCommand('extension.ccUpdateView', () => {
        this.ClearCase.updateView();
      }, this)
    );

    this.m_disposables.push(
      commands.registerCommand('extension.ccUpdateDir', (filePath?: Uri) => {
        if (window &&
          window.activeTextEditor &&
          window.activeTextEditor.document) {
          this.ClearCase.updateDir(filePath);
        }
      }, this)
    );

    this.m_disposables.push(
      commands.registerCommand('extension.ccUpdateFile', (filePath?: Uri) => {
        if (window &&
          window.activeTextEditor &&
          window.activeTextEditor.document) {
          this.ClearCase.updateFile(filePath);
        }
      }, this)
    );

    this.m_disposables.push(
      commands.registerCommand('extension.ccSelectActv', () => {
        this.ClearCase.changeCurrentActivity();
      }, this)
    );

    let annoCtrl = new ccAnnotationController(this,
      window.activeTextEditor,
      this.m_context,
      this.configHandler);
    this.m_context.subscriptions.push(annoCtrl);

    this.m_disposables.push(
      commands.registerCommand('extension.ccAnnotate', (filePath?: Uri) => {
        if (window &&
          window.activeTextEditor &&
          window.activeTextEditor.document) {
          this.ClearCase.annotate(filePath || window.activeTextEditor.document.uri, annoCtrl);
        }
      }, this)
    );

    this.m_context.subscriptions.push(
      languages.registerCodeLensProvider(
        ccCodeLensProvider.selector,
        new ccCodeLensProvider(this.m_context, this.configHandler, this)));
  }

  public registerCommand(cmdName: string, cmd: (fileObj: Uri) => void) {
    this.m_disposables.push(
      commands.registerCommand(cmdName, (fileObj: Uri | ccScmResource) => {
        let file: Uri = null;
        if (fileObj instanceof Uri)
          file = fileObj;
        if (fileObj instanceof ccScmResource)
          file = fileObj.resourceUri;
        if (file === null) {
          if (window && window.activeTextEditor) {
            file = window.activeTextEditor.document.uri;
          }
        }
        if (file !== null)
          this.ClearCase.execOnSCMFile(file, cmd);
      }, this)
    );
  }

  public bindScmCommand() {
    this.m_disposables.push(
      commands.registerCommand('extension.ccCheckinAll', () => {
        let fileObjs: Uri[] = this.m_ccCheckedoutGrp.resourceStates.map(val => {
          return val.resourceUri;
        });
        let checkinComment = this.m_ccScm.inputBox.value;
        this.ClearCase.checkinFiles(fileObjs, checkinComment).then(() => {
          this.m_ccScm.inputBox.value = "";
          this.updateCheckedOutList();
        });
      }, this));

    this.m_disposables.push(
      commands.registerCommand('extension.ccRefreshFileList', () => {
        this.updateCheckedOutList();
      }, this));

    this.m_disposables.push(
      commands.registerCommand('extension.ccRefreshViewPrivateFileList', () => {
        this.updateUntrackedList();
      }, this));

    this.m_disposables.push(
      commands.registerCommand('extension.ccDeleteViewPrivate', (fileObj: ccScmResource) => {
        this.deleteViewPrivateFile(fileObj);
      }, this));
  }

  public bindEvents() {
    this.m_disposables.push(
      workspace.onWillSaveTextDocument(this.onWillSaveDocument, this)
    );

    this.m_disposables.push(
      window.onDidChangeActiveTextEditor(this.onDidChangeTextEditor, this)
    );
  }

  public async onWillSaveDocument(event: TextDocumentWillSaveEvent) {
    try {
      if (event == null ||
        event.document == null ||
        event.document.isUntitled ||
        event.reason != TextDocumentSaveReason.Manual)
        return;
      if (this.ClearCase.isReadOnly(event.document)) {

        let useClearDlg = this.configHandler.configuration.UseClearDlg.Value;
        if (useClearDlg) {
          this.ClearCase.checkoutAndSaveFile(event.document);
        } else {
          this.ClearCase.isClearcaseObject(event.document.uri).then((state: boolean) => {
            if (state === true) {
              this.ClearCase.checkoutFile(event.document.uri).then((isCheckedOut) => {
                if (isCheckedOut === true)
                  event.document.save();
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
          version = await this.ClearCase.getVersionInformation(event.document.uri);
        }
        catch (error) {
          this.outputChannel.appendLine("Clearcase error: getVersionInformation: " + error);
        }
        if (version == "") {
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

      let prev_uri = await this.m_ccContentProvider.provideOriginalResource(fileObj);
      let fn = basename(fileObj.fsPath);
      let { version } = fromCcUri(prev_uri);

      commands.executeCommand('vscode.diff', prev_uri, fileObj, `${fn} ${version} - (WorkingDir)`, opts);
    }
  }

  public async onDidChangeTextEditor(editor: TextEditor) {
    await this.ClearCase.checkIsView(editor);
    this.updateCheckedOutList();
    this.m_windowChangedEvent.fire();
  }

  dispose(): void {
    this.m_disposables.forEach(d => d.dispose());
    this.m_disposables = [];
  }
}

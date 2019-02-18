import { SourceControl, scm, SourceControlResourceGroup, Uri, Disposable, OutputChannel, commands, Location, workspace, window, ViewColumn, TextDocumentShowOptions, TextDocumentWillSaveEvent, TextDocumentSaveReason, ExtensionContext, languages, EventEmitter, Event, TextEditor, SourceControlResourceThemableDecorations, UriHandler, TextDocument } from "vscode";
import { ccScmResource, ResourceGroupType } from "./ccScmResource";
import { ccScmStatus } from "./ccScmStatus";
import { ClearCase, EventArgs } from "./clearcase";
import { LocalizeFunc, loadMessageBundle } from "vscode-nls";
import { Model } from "./model";
import { ccConfigHandler } from "./ccConfigHandler";
import { ccAnnotationController } from "./ccAnnotateController";
import { ccCodeLensProvider } from "./ccAnnotateLensProvider";
import { join } from "path";

const localize: LocalizeFunc = loadMessageBundle();

export class ccScmProvider {

  private m_ccHandler: ClearCase;
  private m_model: Model;
  private m_ccScm: SourceControl;
  private m_ccCheckedoutGrp: SourceControlResourceGroup;
  private m_ccUntrackedGrp: SourceControlResourceGroup;
  private m_isUpdatingUntracked: boolean;

  private m_windowChangedEvent: EventEmitter<void>;

  constructor(private m_context: ExtensionContext,
    private m_disposables: Disposable[],
    private outputChannel: OutputChannel,
    private configHandler: ccConfigHandler) {

    this.m_ccHandler = new ClearCase(m_context, configHandler, outputChannel);
    this.m_windowChangedEvent = new EventEmitter<void>();

    this.m_ccHandler.checkIsView(null).then(() => {
      if (this.m_ccHandler.IsView) {
        this.m_ccScm = scm.createSourceControl('cc', 'ClearCase');
        this.m_ccCheckedoutGrp = this.m_ccScm.createResourceGroup("cc_checkedout", "Checked out");
        this.m_ccUntrackedGrp = this.m_ccScm.createResourceGroup("cc_untracked", "View private");
        this.m_ccCheckedoutGrp.hideWhenEmpty = true;
        this.m_ccUntrackedGrp.hideWhenEmpty = true;
        
        this.m_context.subscriptions.push(this.m_ccScm);
        
        this.m_ccScm.inputBox.placeholder = "Message (press Ctrl+Enter to checkin all files)";
        this.m_ccScm.acceptInputCommand = { command: 'extension.ccCheckinAll', title: localize('checkinall', 'Check In All') };
        
        this.m_model = new Model();
        this.m_model.onWorkspaceChanged(this.handleChangeFiles, this, this.m_disposables);
        this.m_model.onWorkspaceDeleted(this.handleDeleteFiles, this, this.m_disposables);
        
        this.ClearCase.onCommandExecuted((evArgs: Uri) => {
          this.handleChangeFiles(evArgs);
        });

        this.bindScmCommand();

        this.m_isUpdatingUntracked = false;

        this.updateCheckedOutList();
        this.updateUntrackedList();
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
      });
    });
  }

  public async handleChangeFiles(fileObj: Uri) {
    let version = await this.ClearCase.getVersionInformation(fileObj);
    let filteredCheckedout = this.m_ccCheckedoutGrp.resourceStates.filter((val) => {
      if (val.resourceUri.fsPath != fileObj.fsPath)
        return val;
    });
    let filteredUntracked = this.m_ccUntrackedGrp.resourceStates.filter((val) => {
      if (val.resourceUri.fsPath != fileObj.fsPath)
        return val;
    });
    // file is checked out, add to resource state list
    if (version.match(/checkedout/i) !== null) {
      filteredCheckedout.push(new ccScmResource(ResourceGroupType.Index, fileObj, ccScmStatus.MODIFIED));
    }
    // file has no version information, so it is view private
    if (version == "") {
      filteredUntracked.push(new ccScmResource(ResourceGroupType.Index, fileObj, ccScmStatus.UNTRACKED));
    }
    this.m_ccCheckedoutGrp.resourceStates = filteredCheckedout;
    this.m_ccUntrackedGrp.resourceStates = filteredUntracked;
  }

  public async handleDeleteFiles(fileObj: Uri) {
    let version = await this.ClearCase.getVersionInformation(fileObj);
    let filtered = this.m_ccCheckedoutGrp.resourceStates.filter((val) => {
      if (val.resourceUri.fsPath != fileObj.fsPath)
        return val;
    });
    this.m_ccCheckedoutGrp.resourceStates = filtered;
  }

  public async updateCheckedOutList() {
    let checkedout: ccScmResource[] = [];

    this.ClearCase.findCheckouts().then((files) => {
      checkedout = files.map((val) => {
        return new ccScmResource(ResourceGroupType.Index, Uri.file(val), ccScmStatus.MODIFIED);
      }).sort((val1, val2) => {
        return (val1.resourceUri.fsPath.localeCompare(val2.resourceUri.fsPath));
      });
      this.m_ccCheckedoutGrp.resourceStates = checkedout;
      this.m_isUpdatingUntracked = false;
    });
  }

  public async updateUntrackedList() {
    let viewPrv: ccScmResource[] = [];
    if (this.m_isUpdatingUntracked === false) {
      this.m_isUpdatingUntracked = true;
      for (let i = 0; i < workspace.workspaceFolders.length; i++)
      {
        let root = workspace.workspaceFolders[i].uri;
        let files = await this.ClearCase.findUntracked(root);
        viewPrv = viewPrv.concat(files.map((val) => {
          return new ccScmResource(ResourceGroupType.Untracked, Uri.file(join(root.fsPath, val)), ccScmStatus.UNTRACKED);
        }));
        this.m_ccUntrackedGrp.resourceStates = viewPrv;
      }
    }
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
      commands.registerCommand('extension.ccOpenResource', (fileObj: Uri) => {
        this.openResource(fileObj);
      }, this)
    );

    this.m_disposables.push(
      commands.registerCommand('extension.ccFindModified', () => {
        if (workspace.rootPath)
          this.ClearCase.findModified(workspace.rootPath);
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
        if( file === null )
        {
          if( window && window.activeTextEditor )
          {
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
        this.updateUntrackedList();
      }, this));
  }

  public bindEvents() {
    this.m_disposables.push(
      workspace.onWillSaveTextDocument(this.onWillSaveDocument, this)
    );

    this.m_disposables.push(
      window.onDidChangeActiveTextEditor(this.onDidChangeTextEditor, this)
    );

    this.configHandler.onDidChangeConfiguration((vals: string[]) => {
      if (vals.indexOf("viewPrivateFileSuffixes") !== -1)
        this.updateUntrackedList();
    });
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
          event.waitUntil(Promise.all([
            this.ClearCase.isClearcaseObject(event.document.uri),
            this.ClearCase.checkoutFile(event.document.uri),
            event.document.save()]));
        }
      }
      else {
        let version = await this.ClearCase.getVersionInformation(event.document.uri);
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

import { CCConfigHandler } from "./ccConfigHandler";
import { ClearCase } from "./clearcase";
import { existsSync } from "fs";
import {
  Disposable,
  ExtensionContext,
  StatusBarAlignment,
  StatusBarItem,
  TextDocument,
  TextEditor,
  TextEditorViewColumnChangeEvent,
  Uri,
  window,
  workspace,
} from "vscode";

export class UIInformation {
  private mStatusbar: StatusBarItem | null;
  private mIsActive: boolean;

  public constructor(
    private mContext: ExtensionContext,
    private mDisposables: Disposable[],
    private mConfigHandler: CCConfigHandler,
    private mEditor: TextEditor | undefined,
    private mClearcase: ClearCase | null
  ) {
    this.mIsActive = true;
    this.handleConfigState();
    this.mStatusbar = null;
  }

  public createStatusbarItem() {
    this.mStatusbar = window.createStatusBarItem(StatusBarAlignment.Left);
  }

  public bindEvents() {
    // configuration change event
    this.mConfigHandler.onDidChangeConfiguration(() => this.handleConfigState());

    this.mDisposables.push(workspace.onDidOpenTextDocument((document) => this.receiveDocument(document)));
    this.mDisposables.push(workspace.onDidSaveTextDocument((document) => this.receiveDocument(document)));
    this.mDisposables.push(window.onDidChangeActiveTextEditor((editor) => this.receiveEditor(editor)));
    this.mDisposables.push(window.onDidChangeTextEditorViewColumn((event) => this.receiveEditorColumn(event)));
  }

  public receiveEditorColumn(event: TextEditorViewColumnChangeEvent) {
    if (event && this.mIsActive) {
      this.mEditor = event.textEditor;
      this.queryVersionInformation(this.mEditor.document.uri);
    }
  }

  public receiveDocument(document: TextDocument) {
    if (document && this.mIsActive && existsSync(document.uri.fsPath)) {
      this.queryVersionInformation(document.uri);
    }
  }

  public receiveEditor(editor: TextEditor | undefined) {
    if (editor && this.mIsActive) {
      this.mEditor = editor;
      this.queryVersionInformation(editor.document.uri);
    }
  }

  private handleConfigState() {
    this.mIsActive = this.mConfigHandler.configuration.showStatusbar.value;

    if (this.mIsActive === false) {
      this.mStatusbar?.hide();
    } else {
      this.initialQuery();
    }
  }

  public initialQuery() {
    if (this.mIsActive && this.mEditor?.document) {
      this.queryVersionInformation(this.mEditor.document.uri);
    }
  }

  public queryVersionInformation(iUri: Uri) {
    this.mClearcase
      ?.getVersionInformation(iUri)
      .then((value) => this.updateStatusbar(value))
      .catch(() => this.updateStatusbar(""));
  }

  public async updateStatusbar(iFileInfo: string) {
    if (iFileInfo !== undefined) {
      if ((await this.mClearcase?.hasConfigspec()) === true || iFileInfo !== "") {
        let version = "view private";
        if (iFileInfo !== "") {
          version = iFileInfo;
        }
        if (this.mStatusbar !== null) {
          this.mStatusbar.text = "[" + version + "]";
        }
        this.mStatusbar?.show();
      } else {
        this.mStatusbar?.hide();
      }
    } else {
      this.mStatusbar?.hide();
    }
  }

  public dispose() {
    this.mStatusbar?.dispose();
    this.mDisposables.forEach((disposable) => disposable.dispose());
  }
}

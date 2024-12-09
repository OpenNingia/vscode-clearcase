import { existsSync } from "fs";
import {
  StatusBarAlignment,
  StatusBarItem,
  TextDocument,
  TextEditor,
  TextEditorViewColumnChangeEvent,
  Uri,
  window,
  workspace,
} from "vscode";
import { IDisposable } from "../model";
import { CCVersionState, VersionType } from "../clearcase/verstion-type";
import { ConfigurationHandler } from "../configuration/configuration-handler";
import { Clearcase } from "../clearcase/clearcase";

export class UiInformation implements IDisposable {
  private mStatusbar: StatusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
  private mIsActive = true;
  private mDisposables: IDisposable[] = [];

  constructor(
    private mConfigHandler: ConfigurationHandler,
    private mEditor: TextEditor | undefined,
    private mClearcase: Clearcase | null
  ) {
    this.handleConfigState();

    // configuration change event
    this.mConfigHandler.onDidChangeConfiguration(() => this.handleConfigState());

    this.mDisposables.push(workspace.onDidOpenTextDocument((document) => this.receiveDocument(document)));
    this.mDisposables.push(workspace.onDidSaveTextDocument((document) => this.receiveDocument(document)));
    this.mDisposables.push(window.onDidChangeActiveTextEditor((editor) => this.receiveEditor(editor)));
    this.mDisposables.push(window.onDidChangeTextEditorViewColumn((event) => this.receiveEditorColumn(event)));
    if (this.mClearcase) {
      this.mDisposables.push(
        this.mClearcase.onCommandExecuted(() => {
          this.initialQuery();
        })
      );
    }

    this.initialQuery();
  }

  private receiveEditorColumn(event: TextEditorViewColumnChangeEvent) {
    if (event && this.mIsActive) {
      this.mEditor = event.textEditor;
      this.queryVersionInformation(this.mEditor.document.uri);
    }
  }

  private receiveDocument(document: TextDocument) {
    if (document && this.mIsActive && existsSync(document.uri.fsPath)) {
      this.queryVersionInformation(document.uri);
    }
  }

  private receiveEditor(editor: TextEditor | undefined) {
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

  initialQuery(): void {
    if (this.mIsActive && this.mEditor?.document) {
      this.queryVersionInformation(this.mEditor.document.uri);
    }
  }

  private queryVersionInformation(iUri: Uri) {
    if (iUri.scheme !== "output") {
      this.mClearcase
        ?.getVersionInformation(iUri)
        .then((value) => this.updateStatusbar(value))
        .catch(() => this.updateStatusbar(new VersionType()));
    }
  }

  private async updateStatusbar(version: VersionType) {
    if (version !== undefined) {
      if (version.version !== "") {
        if (this.mStatusbar !== null) {
          switch (version.state) {
            case CCVersionState.Versioned: {
              this.mStatusbar.text = `[${version.version}]`;
              break;
            }
            case CCVersionState.Hijacked: {
              this.mStatusbar.text = `[HIJACKED]`;
              break;
            }
            default:
              this.mStatusbar.text = ``;
          }
        }
        this.mStatusbar?.show();
      } else {
        this.mStatusbar?.hide();
      }
    } else {
      this.mStatusbar?.hide();
    }
  }

  dispose(): void {
    this.mStatusbar?.dispose();
    this.mDisposables.forEach((disposable) => disposable.dispose());
  }
}

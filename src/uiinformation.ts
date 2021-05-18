import * as vscode from 'vscode';
import { CCConfigHandler } from './ccConfigHandler';
import { ClearCase } from './clearcase';
import { existsSync } from 'fs';

export class UIInformation {
	private mStatusbar: vscode.StatusBarItem|null;
	private mIsActive: boolean;

	public constructor(private mContext: vscode.ExtensionContext,
		private mDisposables: vscode.Disposable[],
		private mConfigHandler: CCConfigHandler,
		private mEditor: vscode.TextEditor|undefined,
		private mClearcase: ClearCase) {
		this.mIsActive = true;
		this.handleConfigState();
		this.mStatusbar = null;
	}

	public createStatusbarItem() {
		this.mStatusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	}

	public bindEvents() {
		// configuration change event
		this.mConfigHandler.onDidChangeConfiguration(this.handleConfigState, this);

		this.mDisposables.push(
			vscode.workspace.onDidOpenTextDocument(
				this.receiveDocument, this));
		this.mDisposables.push(
			vscode.workspace.onDidSaveTextDocument(
				this.receiveDocument, this));
		this.mDisposables.push(
			vscode.window.onDidChangeActiveTextEditor(
				this.receiveEditor, this));
		this.mDisposables.push(
			vscode.window.onDidChangeTextEditorViewColumn(
				this.receiveEditorColumn, this));
	}

	public receiveEditorColumn(event: vscode.TextEditorViewColumnChangeEvent) {
		if (event && this.mIsActive) {
			this.mEditor = event.textEditor;
			this.queryVersionInformation(this.mEditor.document.uri);
		}
	}

	public receiveDocument(event: any) {
		if (event && this.mIsActive && existsSync(event.uri.fsPath)) {
			this.queryVersionInformation(event.uri);
		}
	}

	public receiveEditor(event: vscode.TextEditor|undefined) {
		if (event && this.mIsActive) {
			this.mEditor = event;
			this.queryVersionInformation(event.document.uri);
		}
	}

	private handleConfigState() {
		this.mIsActive = this.mConfigHandler.configuration.showStatusbar.value;

		if (this.mIsActive === false) {
			this.mStatusbar?.hide();
		}
		else {
			this.initialQuery();
		}
	}

	public initialQuery() {
		if (this.mIsActive && this.mEditor && this.mEditor.document) {
			this.queryVersionInformation(this.mEditor.document.uri);
		}
	}

	public queryVersionInformation(iUri: vscode.Uri) {
		this.mClearcase.getVersionInformation(iUri).then((value) => {
			this.updateStatusbar(value);
		}).catch((error) => {
			this.updateStatusbar('');
		});
	}

	public async updateStatusbar(iFileInfo: string) {
		if (iFileInfo !== undefined) {
			if (await this.mClearcase.hasConfigspec() === true || iFileInfo !== "") {
				let version = "view private";
				if (iFileInfo !== "") {
					version = iFileInfo;
				}
				if(this.mStatusbar !== null) {
					this.mStatusbar.text = "[" + version + "]";
				}
				this.mStatusbar?.show();
			}
			else {
				this.mStatusbar?.hide();
			}
		}
		else {
			this.mStatusbar?.hide();
		}
	}

	public dispose() {
		this.mStatusbar?.dispose();
	}
}

'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'child_process'
import * as fs from 'fs';
import { dirname } from 'path';
import {EventEmitter} from 'events'

export class ClearCase{

    private m_context: vscode.ExtensionContext;
    private m_updateEvent: EventEmitter;

    public constructor(context:vscode.ExtensionContext)
    {
        this.m_context = context;
        this.m_updateEvent = new EventEmitter();
    }

    public bindEvents()
    {
        let disposable = vscode.commands.registerCommand('extension.ccExplorer', () => {
            this.execOnSCMFile(vscode.window.activeTextEditor.document, this.runClearCaseExplorer);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand('extension.ccCheckout', () => {
            this.execOnSCMFile(vscode.window.activeTextEditor.document, this.checkoutFile);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand('extension.ccCheckin', () => {
            this.execOnSCMFile(vscode.window.activeTextEditor.document, this.checkinFile);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand('extension.ccVersionTree', () => {
            this.execOnSCMFile(vscode.window.activeTextEditor.document, this.versionTree);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand('extension.ccComparePrevious', () => {
            this.execOnSCMFile(vscode.window.activeTextEditor.document, this.diffWithPrevious);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand('extension.ccUndoCheckout', () => {
            this.execOnSCMFile(vscode.window.activeTextEditor.document, this.undoCheckoutFile);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand('extension.ccFindCheckouts', () => {
            if (vscode.workspace.rootPath)
                this.findCheckouts(vscode.workspace.rootPath);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand('extension.ccFindModified', () => {
            if (vscode.workspace.rootPath)
                this.findModified(vscode.workspace.rootPath);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand('extension.ccItemProperties', () => {
            this.execOnSCMFile(vscode.window.activeTextEditor.document, this.itemProperties);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand('extension.ccUpdateView', () => {
            this.updateView();
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand('extension.ccUpdateDir', (filePath?: vscode.Uri) => {
            if (vscode.window &&
                vscode.window.activeTextEditor &&
                vscode.window.activeTextEditor.document) {
                this.updateObject(filePath, 0);
            }
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand('extension.ccUpdateFile', (filePath?: vscode.Uri) => {
            if (vscode.window &&
                vscode.window.activeTextEditor &&
                vscode.window.activeTextEditor.document) {
                this.updateObject(filePath, 1);
            }
        }, this);

        this.m_context.subscriptions.push(disposable);
    }

    public onCommandExecuted(func : (string) => void)
    {
        this.m_updateEvent.on("changed", func);
    }

    public bindCommands()
    {
        this.m_context.subscriptions.push(
            vscode.workspace.onWillSaveTextDocument((event) => {
                try {
                    if (event == null || event.document == null || event.document.isUntitled || event.reason != vscode.TextDocumentSaveReason.Manual)
                        return;
                    if (this.isReadOnly(event.document)) {
                        this.execOnSCMFile(event.document, this.checkoutAndSaveFile);
                    }
                } catch (error) { console.log("error " + error); }
        }, this, this.m_context.subscriptions));
    }

    public execOnSCMFile(doc: vscode.TextDocument, func: (string) => void) {
        var path = doc.fileName;
        var self = this;
        exec("cleartool ls \"" + path + "\"", (error, stdout, stderr) => {
            if (error) {
                console.error(`clearcase, exec error: ${error}`);
                vscode.window.showErrorMessage(`${path} is not a valid ClearCase object.`);
                return;
            }
            func.apply(self, [doc]);
            console.log(`clearcase, stdout: ${stdout}`);
            console.log(`clearcase, stderr: ${stderr}`);
        });
    }

    public runClearCaseExplorer(doc: vscode.TextDocument) {
        var path = doc.fileName;
        exec("clearexplorer \"" + path + "\"");
    }

    public checkoutFile(doc: vscode.TextDocument) {
        var path = doc.fileName;
        exec("cleardlg /checkout \"" + path + "\"", (error, stdout, stderr) => {
            this.m_updateEvent.emit("changed");
        });
    }

    public checkoutAndSaveFile(doc: vscode.TextDocument) {
        var path = doc.fileName;
        exec("cleardlg /checkout \"" + path + "\"", (error, stdout, stderr) => {
            console.log(`clearcase, checkout and save.`);
            console.log(`clearcase, stdout: ${stdout}`);
            console.log(`clearcase, stderr: ${stderr}`);
            // only trigger save if checkout did work
            // If not and the user canceled this dialog the save event is
            // retriggered because of that save.
            if( this.isReadOnly(doc) === false ) {
                doc.save();
                console.log(`clearcase, file saved.`);
            } else {
                console.log(`clearcase, file is still read only.`);
            }
        });
    }

    public undoCheckoutFile(doc: vscode.TextDocument) {
        var path = doc.fileName;
        exec("cleartool unco -rm \"" + path + "\"", (error, stdout, stderr) => {
            this.m_updateEvent.emit("changed");
        });
    }

    public checkinFile(doc: vscode.TextDocument) {
        var path = doc.fileName;
        exec("cleardlg /checkin \"" + path + "\"", (error, stdout, stderr) => {
            this.m_updateEvent.emit("changed");
        });
    }

    public versionTree(doc: vscode.TextDocument) {
        var path = doc.fileName;
        exec("cleartool lsvtree -graphical \"" + path + "\"");
    }

    public diffWithPrevious(doc: vscode.TextDocument) {
        var path = doc.fileName;
        exec("cleartool diff -graph -pred \"" + path + "\"");
    }

    public findCheckouts(path: string) {
        exec("clearfindco \"" + path + "\"");
    }

    public findModified(path: string) {
        exec("clearviewupdate -pname \"" + path + "\" -modified");
    }

    public updateView() {
        exec("clearviewupdate");
    }

    /**
     * @param filePath Uri of the selected file object in the explorer
     * @param updateType which one to update: 0=directory, 1=file
     */
    public updateObject(filePath: vscode.Uri, updateType:number) {
        try {
            let p = ((filePath === null || filePath === undefined || filePath.fsPath === null) ?
                        vscode.window.activeTextEditor.document.fileName : filePath.fsPath);
            let stat = fs.lstatSync(p);
            let path = "";
            if (stat.isDirectory()) {
                path = p;
            }
            else if(stat.isFile())
            {
                path = (updateType===0 ? dirname(p) : p);
            }
            if (path !== "") {
                path = "\"" + path + "\"";
            }
            let cmd = "cleartool update " + path;

            exec(cmd, (error, stdout, stderr) => {
                if (stdout !== "") {
                    vscode.window.showInformationMessage("Update of " + path + " finished");
                    this.m_updateEvent.emit("changed");
                }
                else if (stderr !== "") {
                    vscode.window.showErrorMessage(stderr);
                }
                else
                {
                    vscode.window.showErrorMessage(error.message);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(error.message);
        }
    }

    public itemProperties(doc: vscode.TextDocument) {
        var path = doc.fileName;
        exec("cleardescribe \"" + path + "\"");
    }

    // returns true if the given document is read-only
    public isReadOnly(doc: vscode.TextDocument): boolean {
        let filePath = doc.fileName;
        try {
            fs.accessSync(filePath, fs.constants.W_OK);
            return false;
        } catch (error) {
            return true;
        }
    }
}



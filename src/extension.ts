'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {exec} from 'child_process'
import * as fs from 'fs';
import {dirname} from 'path';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "vscode-clearcase" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.ccExplorer', () => {
        execOnSCMFile(vscode.window.activeTextEditor.document, runClearCaseExplorer);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccCheckout', () => {
        execOnSCMFile(vscode.window.activeTextEditor.document, checkoutFile);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccCheckin', () => {
        execOnSCMFile(vscode.window.activeTextEditor.document, checkinFile);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccVersionTree', () => {
        execOnSCMFile(vscode.window.activeTextEditor.document, versionTree);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccComparePrevious', () => {
        execOnSCMFile(vscode.window.activeTextEditor.document, diffWithPrevious);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccUndoCheckout', () => {
        execOnSCMFile(vscode.window.activeTextEditor.document, undoCheckoutFile);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccFindCheckouts', () => {
        if ( vscode.workspace.rootPath )
            findCheckouts(vscode.workspace.rootPath);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccFindModified', () => {
        if ( vscode.workspace.rootPath )
            findModified(vscode.workspace.rootPath);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccItemProperties', () => {
        execOnSCMFile(vscode.window.activeTextEditor.document, itemProperties);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccUpdateView', () => {
        if ( vscode.workspace.rootPath )
            updateObject(vscode.workspace.rootPath);
    });

    disposable = vscode.commands.registerCommand('extension.ccUpdateDir', () => {
        if ( vscode.window &&
             vscode.window.activeTextEditor &&
             vscode.window.activeTextEditor.document ) {
            updateObject(dirname(vscode.window.activeTextEditor.document.fileName));
        }
    });

    disposable = vscode.commands.registerCommand('extension.ccUpdateFile', () => {
        if ( vscode.window &&
             vscode.window.activeTextEditor &&
             vscode.window.activeTextEditor.document )
            updateObject(vscode.window.activeTextEditor.document.fileName);
    });

    context.subscriptions.push(disposable);

    vscode.workspace.onWillSaveTextDocument((event) => {
        try {
            if ( event == null || event.document == null || event.document.isUntitled || event.reason != vscode.TextDocumentSaveReason.Manual )
                return;
            if ( isReadOnly(event.document) ) {
                execOnSCMFile(event.document, checkoutAndSaveFile);
            }
        } catch (error) { console.log("error " + error); }

    }, null, context.subscriptions);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function execOnSCMFile(doc: vscode.TextDocument, func: (string) => void)
{
    var path = doc.fileName;
    exec("cleartool ls \"" + path + "\"", (error, stdout, stderr) => {
    if (error) {
        console.error(`exec error: ${error}`);
        vscode.window.showErrorMessage(`${path} is not a valid ClearCase object.`);
        return;
    }
    func(doc);
    console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);
    });
}

function runClearCaseExplorer(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("clearexplorer \"" + path + "\"");
}

function checkoutFile(doc: vscode.TextDocument) {
    var path = doc.fileName;
    console.log(`checkout no save.`);
    exec("cleardlg /checkout \"" + path + "\"");
}

function checkoutAndSaveFile(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleardlg /checkout \"" + path + "\"", (error, stdout, stderr) => {
        console.log(`checkout and save. ${error}`);
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
        console.log(`saving file...`);
        doc.save();
    });
}

function undoCheckoutFile(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleartool unco -rm \"" + path + "\"");
}

function checkinFile(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleardlg /checkin \"" + path + "\"");
}

function versionTree(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleartool lsvtree -graphical \"" + path + "\"");
}

function diffWithPrevious(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleartool diff -graph -pred \"" + path + "\"");
}

function findCheckouts(path: string) {
    exec("clearfindco \"" + path + "\"");
}

function findModified(path: string) {
    exec("clearviewupdate -pname \"" + path + "\" -modified");
}

function updatePath(path: string) {
    exec("clearviewupdate -pname \"" + path + "\"");
}

function updateObject(path: string) {
    try{
        fs.accessSync(path, fs.constants.F_OK);
        if( path && path !== "" )
            exec("cleartool update \"" + path + "\"", (error, stdout, stderr) => {
                console.log(stdout.replace(/[\n\r]/g, " "));
                if( stdout !== "" ) {
                    vscode.window.showInformationMessage("Update of " + path + " finished");
                }
            });
    } catch(error){
        return;
    }
}

function itemProperties(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleardescribe \"" + path + "\"");
}

function isReadOnly(doc: vscode.TextDocument): boolean {
    let filePath = doc.fileName;
    try {
        fs.accessSync(filePath, fs.constants.W_OK);
        return false;
    } catch (error) {
        return true;
    }
}

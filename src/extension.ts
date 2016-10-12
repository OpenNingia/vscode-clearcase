'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {exec, execSync} from 'child_process'
import * as fs from 'fs';

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
        // The code you place here will be executed every time your command is executed
        var current_file = vscode.window.activeTextEditor.document.fileName;
        execOnSCMFile(current_file, runClearCaseExplorer);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccCheckout', () => {
        // The code you place here will be executed every time your command is executed
        var current_file = vscode.window.activeTextEditor.document.fileName;
        execOnSCMFile(current_file, checkoutFile);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccCheckin', () => {
        // The code you place here will be executed every time your command is executed
        var current_file = vscode.window.activeTextEditor.document.fileName;
        execOnSCMFile(current_file, checkinFile);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccVersionTree', () => {
        // The code you place here will be executed every time your command is executed
        var current_file = vscode.window.activeTextEditor.document.fileName;
        execOnSCMFile(current_file, versionTree);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccComparePrevious', () => {
        // The code you place here will be executed every time your command is executed
        var current_file = vscode.window.activeTextEditor.document.fileName;
        execOnSCMFile(current_file, diffWithPrevious);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccUndoCheckout', () => {
        // The code you place here will be executed every time your command is executed
        var current_file = vscode.window.activeTextEditor.document.fileName;
        execOnSCMFile(current_file, undoCheckoutFile);
    });

    context.subscriptions.push(disposable);

    vscode.workspace.onWillSaveTextDocument((event) => {
        try {
            if ( event == null || event.document == null || event.document.isUntitled || event.reason != vscode.TextDocumentSaveReason.Manual )
                return;
            if ( isReadOnly(event.document) ) {
                execOnSCMFile(event.document.fileName, checkoutFile);
            }
        } catch (error) { console.log("error " + error); }

    }, null, context.subscriptions);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function execOnSCMFile(path: string, func: (string) => void)
{
    exec('cleartool ls ' + path, (error, stdout, stderr) => {
    if (error) {
        console.error(`exec error: ${error}`);
        vscode.window.showErrorMessage(`${path} is not a valid ClearCase object.`);
        return;
    }
    func(path);
    console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);
    });
}

function runClearCaseExplorer(path: string) {
    exec('clearexplorer ' + path);
}

function checkoutFile(path: string) {
    exec('cleardlg /checkout ' + path);
}

function undoCheckoutFile(path: string) {
    exec('cleartool unco ' + path);
}

function checkinFile(path: string) {
    exec('cleardlg /checkin ' + path);
}

function versionTree(path: string) {
    exec('cleartool lsvtree -graphical ' + path);
}

function diffWithPrevious(path: string) {
    exec('cleartool diff -graph -pred ' + path);
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

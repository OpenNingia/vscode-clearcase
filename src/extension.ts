'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {
    execOnSCMFile, runClearCaseExplorer, checkoutFile, checkinFile,
    versionTree, diffWithPrevious, undoCheckoutFile, findCheckouts,
    itemProperties, updateView, updateObject, isReadOnly,
    checkoutAndSaveFile, findModified } from './clearcase';

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
        if (vscode.workspace.rootPath)
            findCheckouts(vscode.workspace.rootPath);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccFindModified', () => {
        if (vscode.workspace.rootPath)
            findModified(vscode.workspace.rootPath);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccItemProperties', () => {
        execOnSCMFile(vscode.window.activeTextEditor.document, itemProperties);
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccUpdateView', () => {
        updateView();
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccUpdateDir', (filePath?: vscode.Uri) => {
        if (vscode.window &&
            vscode.window.activeTextEditor &&
            vscode.window.activeTextEditor.document) {
            updateObject(filePath, 0);
        }
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.ccUpdateFile', (filePath?: vscode.Uri) => {
        if (vscode.window &&
            vscode.window.activeTextEditor &&
            vscode.window.activeTextEditor.document) {
            updateObject(filePath, 1);
        }
    });

    context.subscriptions.push(disposable);

    vscode.workspace.onWillSaveTextDocument((event) => {
        try {
            if (event == null || event.document == null || event.document.isUntitled || event.reason != vscode.TextDocumentSaveReason.Manual)
                return;
            if (isReadOnly(event.document)) {
                execOnSCMFile(event.document, checkoutAndSaveFile);
            }
        } catch (error) { console.log("error " + error); }

    }, null, context.subscriptions);
}

// this method is called when your extension is deactivated
export function deactivate() {
}


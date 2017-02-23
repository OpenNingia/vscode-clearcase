'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'child_process'
import * as fs from 'fs';
import { dirname } from 'path';

export function execOnSCMFile(doc: vscode.TextDocument, func: (string) => void) {
    var path = doc.fileName;
    exec("cleartool ls \"" + path + "\"", (error, stdout, stderr) => {
        if (error) {
            console.error(`clearcase, exec error: ${error}`);
            vscode.window.showErrorMessage(`${path} is not a valid ClearCase object.`);
            return;
        }
        func(doc);
        console.log(`clearcase, stdout: ${stdout}`);
        console.log(`clearcase, stderr: ${stderr}`);
    });
}

export function runClearCaseExplorer(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("clearexplorer \"" + path + "\"");
}

export function checkoutFile(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleardlg /checkout \"" + path + "\"");
}

export function checkoutAndSaveFile(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleardlg /checkout \"" + path + "\"", (error, stdout, stderr) => {
        console.log(`clearcase, checkout and save.`);
        console.log(`clearcase, stdout: ${stdout}`);
        console.log(`clearcase, stderr: ${stderr}`);
        // only trigger save if checkout did work
        // If not and the user canceled this dialog the save event is
        // retriggered because of that save.
        if( isReadOnly(doc) === false ) {
            doc.save();
            console.log(`clearcase, file saved.`);
        } else {
            console.log(`clearcase, file is still read only.`);
        }
    });
}

export function undoCheckoutFile(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleartool unco -rm \"" + path + "\"");
}

export function checkinFile(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleardlg /checkin \"" + path + "\"");
}

export function versionTree(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleartool lsvtree -graphical \"" + path + "\"");
}

export function diffWithPrevious(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleartool diff -graph -pred \"" + path + "\"");
}

export function findCheckouts(path: string) {
    exec("clearfindco \"" + path + "\"");
}

export function findModified(path: string) {
    exec("clearviewupdate -pname \"" + path + "\" -modified");
}

export function updateView() {
    exec("clearviewupdate");
}

/**
 * @param filePath Uri of the selected file object in the explorer
 * @param updateType which one to update: 0=directory, 1=file
 */
export function updateObject(filePath: vscode.Uri, updateType:number) {
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

export function itemProperties(doc: vscode.TextDocument) {
    var path = doc.fileName;
    exec("cleardescribe \"" + path + "\"");
}

// returns true if the given document is read-only
export function isReadOnly(doc: vscode.TextDocument): boolean {
    let filePath = doc.fileName;
    try {
        fs.accessSync(filePath, fs.constants.W_OK);
        return false;
    } catch (error) {
        return true;
    }
}

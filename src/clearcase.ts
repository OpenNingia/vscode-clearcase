'use strict';
// The module ' contains the VS Code extensibility API
// Import the module and reference it with the alias in your code below
import {ExtensionContext,commands, window, workspace, Uri,
        languages, TextDocument, TextDocumentSaveReason} from 'vscode'
import {exec, execSync} from 'child_process'
import * as fs from 'fs';
import {dirname} from 'path';
import {EventEmitter} from 'events'
import ClearcaseAnnotateContentProvider from "./annotateContentProvider"
import {ccCodeLensProvider} from "./ccAnnotateLensProvider";
import {ccAnnotationController} from './ccAnnotateController'
import {ccConfigHandler} from './ccConfigHandler';

export class ClearCase{

    private m_isClearcaseView: boolean;
    private m_context: ExtensionContext;
    private m_updateEvent: EventEmitter;

    public constructor(context:ExtensionContext,
                       private configHandler: ccConfigHandler)
    {
        this.m_context = context;
        this.m_updateEvent = new EventEmitter();
        this.checkIsClearcaseView(window.activeTextEditor.document);
    }

    public bindCommands()
    {
        let disposable = commands.registerCommand('extension.ccExplorer', () => {
            this.execOnSCMFile(window.activeTextEditor.document, this.runClearCaseExplorer);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = commands.registerCommand('extension.ccCheckout', () => {
            this.execOnSCMFile(window.activeTextEditor.document, this.checkoutFile);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = commands.registerCommand('extension.ccCheckin', () => {
            this.execOnSCMFile(window.activeTextEditor.document, this.checkinFile);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = commands.registerCommand('extension.ccVersionTree', () => {
            this.execOnSCMFile(window.activeTextEditor.document, this.versionTree);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = commands.registerCommand('extension.ccComparePrevious', () => {
            this.execOnSCMFile(window.activeTextEditor.document, this.diffWithPrevious);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = commands.registerCommand('extension.ccUndoCheckout', () => {
            this.execOnSCMFile(window.activeTextEditor.document, this.undoCheckoutFile);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = commands.registerCommand('extension.ccFindCheckouts', () => {
            if (workspace.rootPath)
                this.findCheckouts(workspace.rootPath);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = commands.registerCommand('extension.ccFindModified', () => {
            if (workspace.rootPath)
                this.findModified(workspace.rootPath);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = commands.registerCommand('extension.ccItemProperties', () => {
            this.execOnSCMFile(window.activeTextEditor.document, this.itemProperties);
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = commands.registerCommand('extension.ccUpdateView', () => {
            this.updateView();
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = commands.registerCommand('extension.ccUpdateDir', (filePath?: Uri) => {
            if (window &&
                window.activeTextEditor &&
                window.activeTextEditor.document) {
                this.updateDir(filePath);
            }
        }, this);

        this.m_context.subscriptions.push(disposable);

        disposable = commands.registerCommand('extension.ccUpdateFile', (filePath?: Uri) => {
            if (window &&
                window.activeTextEditor &&
                window.activeTextEditor.document) {
                this.updateFile(filePath);
            }
        }, this);

        this.m_context.subscriptions.push(disposable);

        let annoCtrl = new ccAnnotationController(this,
                                                  window.activeTextEditor,
                                                  this.m_context,
                                                  this.configHandler);
        this.m_context.subscriptions.push(annoCtrl);

        disposable = commands.registerCommand('extension.ccAnnotate', (filePath?: Uri) => {
            if (window &&
                window.activeTextEditor &&
                window.activeTextEditor.document) {
                this.annotate(filePath || window.activeTextEditor.document.uri, annoCtrl);
            }
        }, this);

        this.m_context.subscriptions.push(disposable);

        // register annotation content provider
        //this.m_context.subscriptions.push(
        //    workspace.registerTextDocumentContentProvider(
        //        ClearcaseAnnotateContentProvider.scheme, new ClearcaseAnnotateContentProvider(this.m_context, this)));

        this.m_context.subscriptions.push(
            languages.registerCodeLensProvider(
                ccCodeLensProvider.selector, new ccCodeLensProvider(this.m_context)));

    }

    public onCommandExecuted(func : (string) => void)
    {
        this.m_updateEvent.on("changed", func);
    }

    public bindEvents()
    {
        this.m_context.subscriptions.push(
            workspace.onWillSaveTextDocument((event) => {
                try {
                    if (event == null || event.document == null || event.document.isUntitled || event.reason != TextDocumentSaveReason.Manual)
                        return;
                    if (this.isReadOnly(event.document)) {
                        this.execOnSCMFile(event.document, this.checkoutAndSaveFile);
                    }
                } catch (error) { console.log("error " + error); }
        }, this, this.m_context.subscriptions));
    }

    public async checkIsClearcaseView(document:TextDocument)
    {
        if( document )
        {
            try{
                let msg:string = await this.updateObject(document.uri, 0);
                this.m_isClearcaseView = true;
            }
            catch(error)
            {
                this.m_isClearcaseView = false;
            }
        }
    }

    public execOnSCMFile(doc: TextDocument, func: (string) => void) {
        var path = doc.fileName;
        var self = this;
        exec("cleartool ls \"" + path + "\"", (error, stdout, stderr) => {
            if (error) {
                console.error(`clearcase, exec error: ${error}`);
                window.showErrorMessage(`${path} is not a valid ClearCase object.`);
                return;
            }
            func.apply(self, [doc]);
            console.log(`clearcase, stdout: ${stdout}`);
            console.log(`clearcase, stderr: ${stderr}`);
        });
    }

    public runClearCaseExplorer(doc: TextDocument) {
        var path = doc.fileName;
        exec("clearexplorer \"" + path + "\"");
    }

    public checkoutFile(doc: TextDocument) {
        var path = doc.fileName;
        exec("cleardlg /checkout \"" + path + "\"", (error, stdout, stderr) => {
            this.m_updateEvent.emit("changed");
        });
    }

    public checkoutAndSaveFile(doc: TextDocument) {
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

    public undoCheckoutFile(doc: TextDocument) {
        var path = doc.fileName;
        exec("cleartool unco -rm \"" + path + "\"", (error, stdout, stderr) => {
            this.m_updateEvent.emit("changed");
        });
    }

    public checkinFile(doc: TextDocument) {
        var path = doc.fileName;
        exec("cleardlg /checkin \"" + path + "\"", (error, stdout, stderr) => {
            this.m_updateEvent.emit("changed");
        });
    }

    public versionTree(doc: TextDocument) {
        var path = doc.fileName;
        exec("cleartool lsvtree -graphical \"" + path + "\"");
    }

    public diffWithPrevious(doc: TextDocument) {
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

    public async updateDir(uri:Uri)
    {
        try{
            let msg:string = await this.updateObject(uri, 0);
            window.showInformationMessage(`Update of ${msg} finished!`);
        }
        catch(error)
        {
            window.showErrorMessage(error);
        }
    }

    public async updateFile(uri:Uri)
    {
        try{
            let msg:string = await this.updateObject(uri, 1);
            window.showInformationMessage(`Update of ${msg} finished!`);
        }
        catch(error)
        {
            window.showErrorMessage(error);
        }
    }

    /**
     * @param filePath Uri of the selected file object in the explorer
     * @param updateType which one to update: 0=directory, 1=file
     */
    public async updateObject(filePath: Uri, updateType:number): Promise<string> {
        try {
            let p = ((filePath === null || filePath === undefined || filePath.fsPath === null) ?
                        window.activeTextEditor.document.fileName : filePath.fsPath);
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

            return new Promise<string>((resolve, reject) => {
                exec(cmd, (error, stdout, stderr) => {
                    if (stdout !== "") {
                        this.m_updateEvent.emit("changed");
                        resolve(path);
                    }
                    else if (stderr !== "") {
                        reject(stderr);
                    }
                    else
                    {
                        reject(error.message);
                    }
                });
            })
        } catch (error) {
            throw error.message;
        }
    }

    public itemProperties(doc: TextDocument) {
        var path = doc.fileName;
        exec("cleardescribe \"" + path + "\"");
    }

    async annotate(fileUri: Uri, ctrl: ccAnnotationController): Promise<any> {
        try
        {
            let content = await this.getAnnotatedFileContent(fileUri.fsPath);
            ctrl.setAnnotationInText(content);
        }
        catch(error)
        {
            error = error.replace(/[\r\n]+/g, " ");
            window.showErrorMessage(error);
        }
        //let annUri = fileUri.with( {scheme: ClearcaseAnnotateContentProvider.scheme});
        //workspace.openTextDocument(annUri).then(doc => {
        //    window.showTextDocument(doc);
        //});
    }

    public async getAnnotatedFileContent(filePath: string): Promise<string> {
        let fmt = this.configHandler.configuration.AnnotationFormatString;
        let sep = " | ";
        let param = "\"" + filePath + "\"";
        let cmd = "cleartool annotate -out - -nhe -fmt \"" + fmt + sep + "\" " + param;

        return new Promise<string>((resolve,reject) => {
            exec(cmd, {maxBuffer:10485760}, (error, stdout, stderr) => {
                    if ( error )
                        reject(error.message);
                    else
                        if( stderr )
                            reject(stderr);
                        else
                            resolve(stdout);
                });
        });
    }

    // returns true if the given document is read-only
    public isReadOnly(doc: TextDocument): boolean {
        let filePath = doc.fileName;
        try {
            fs.accessSync(filePath, fs.constants.W_OK);
            return false;
        } catch (error) {
            return true;
        }
    }
}

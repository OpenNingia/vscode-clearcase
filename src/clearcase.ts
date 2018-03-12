'use strict';
// The module ' contains the VS Code extensibility API
// Import the module and reference it with the alias in your code below
import {ExtensionContext,commands, window, workspace, Uri,
        languages, TextEditor, TextDocument, TextDocumentSaveReason,
        EventEmitter, Event, QuickPickItem, InputBoxOptions} from 'vscode'
import {exec, execSync} from 'child_process'
import * as fs from 'fs';
import {dirname} from 'path';
import {ccCodeLensProvider} from "./ccAnnotateLensProvider";
import {ccAnnotationController} from './ccAnnotateController'
import {ccConfigHandler} from './ccConfigHandler';
import { ccConfiguration } from './ccConfiguration';

export class ClearCase{

    private m_isCCView: boolean;
    private m_context: ExtensionContext;
    private m_updateEvent: EventEmitter<void>;
    private m_windowChangedEvent: EventEmitter<void>;

    public constructor(context:ExtensionContext,
                       private configHandler: ccConfigHandler)
    {
        this.m_context = context;
        this.m_updateEvent = new EventEmitter<void>();
        this.m_windowChangedEvent = new EventEmitter<void>();
        this.checkIsView(window.activeTextEditor);
    }

    public get IsView(): boolean
    {
        return this.m_isCCView;
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

        disposable = commands.registerCommand('extension.ccSelectActv', () => {
            this.changeCurrentActivity();
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

        this.m_context.subscriptions.push(
            languages.registerCodeLensProvider(
                ccCodeLensProvider.selector,
                new ccCodeLensProvider(this.m_context, this.configHandler, this)));
    }

    public get onCommandExecuted(): Event<void>
    {
        return this.m_updateEvent.event;
    }

    public get onWindowChanged(): Event<void>
    {
        return this.m_windowChangedEvent.event;
    }

    public bindEvents()
    {
        this.m_context.subscriptions.push(
            workspace.onWillSaveTextDocument((event) => {
                try {
                    if (event == null || event.document == null || event.document.isUntitled || event.reason != TextDocumentSaveReason.Manual)
                        return;
                    if (this.isReadOnly(event.document)) {
                        
                        let useClearDlg = this.configHandler.configuration.UseClearDlg;
                        if ( useClearDlg ) {
                            this.execOnSCMFile(event.document, this.checkoutAndSaveFile);
                        } else {
                            event.waitUntil(Promise.all([
                                this.isClearcaseObject(event.document.uri), 
                                this.checkoutFile(event.document),
                                event.document.save()]));
                        }
                    }
                } catch (error) { console.log("error " + error); }
        }, this, this.m_context.subscriptions));

        this.m_context.subscriptions.push(
            window.onDidChangeActiveTextEditor(this.checkIsView, this, this.m_context.subscriptions)
        );
    }

    /**
     * Checks if the file itself is a clearcase object or if it's in a
     * clearcase view
     *
     * @param editor current editor instance
     */
    public async checkIsView(editor: TextEditor)
    {
        if( editor !== undefined && editor.document !== undefined )
        {
            try
            {
                this.m_isCCView = await this.isClearcaseObject(editor.document.uri);
                if( this.m_isCCView === false )
                    this.m_isCCView = this.hasConfigspec();
            }
            catch(error)
            {
                // can happen i.e. with a new file which has not been save yet
                this.m_isCCView = this.hasConfigspec();
            }
        }
        else
        {
            this.m_isCCView = this.hasConfigspec();
        }
        this.m_windowChangedEvent.fire();
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

    public async checkoutFile(doc: TextDocument) {
        var path = doc.fileName;
        let useClearDlg = this.configHandler.configuration.UseClearDlg;
        let coArgTmpl = this.configHandler.configuration.CheckoutCommand;
        let defComment = this.configHandler.configuration.DefaultComment;

        if ( useClearDlg ) {
            exec("cleardlg /checkout \"" + path + "\"", (error, stdout, stderr) => {
                this.m_updateEvent.fire();
            });
        } else {

            var comment = "";            
            if ( coArgTmpl.indexOf("${comment}") != -1 ) {

                if ( defComment )
                    comment = defComment;
                else {
                    comment = await window.showInputBox(
                        {
                            ignoreFocusOut: true,
                            prompt: "Checkout comment"
                        }
                    ) || "";
                }
            }

            let coArgs = coArgTmpl.replace("${filename}", '"' + path + '"')
                                  .replace("${comment}", '"' + comment + '"');
            exec("cleartool co " + coArgs, (error, stdout, stderr) => {
                this.m_updateEvent.fire();
            });            
        }
    }

    public checkoutAndSaveFile(doc: TextDocument) {           
        let path = doc.fileName;
        exec("cleardlg /checkout \"" + path + "\"", (error, stdout, stderr) => {
            console.log(`clearcase, checkout and save.`);
            console.log(`clearcase, stdout: ${stdout}`);
            console.log(`clearcase, stderr: ${stderr}`);
            // only trigger save if checkout did work
            // If not and the user canceled this dialog the save event is
            // retriggered because of that save.
            if( this.isReadOnly(doc) === false ) {
                doc.save();
                this.m_updateEvent.fire();
                console.log(`clearcase, file saved.`);
            } else {
                console.log(`clearcase, file is still read only.`);
            }
        });
    }

    public undoCheckoutFile(doc: TextDocument) {
        var path = doc.fileName;
        exec("cleartool unco -rm \"" + path + "\"", (error, stdout, stderr) => {
            this.m_updateEvent.fire();
        });
    }

    public async checkinFile(doc: TextDocument) {
        var path = doc.fileName;
        let useClearDlg = this.configHandler.configuration.UseClearDlg;
        let coArgTmpl = this.configHandler.configuration.CheckinCommand;
        let defComment = this.configHandler.configuration.DefaultComment;

        if ( useClearDlg ) {
            exec("cleardlg /checkin \"" + path + "\"", (error, stdout, stderr) => {
                this.m_updateEvent.fire();
            });
        } else {

            var comment = "";            
            if ( coArgTmpl.indexOf("${comment}") != -1 ) {

                if ( defComment )
                    comment = defComment;
                else {
                    comment = await window.showInputBox(
                        {
                            ignoreFocusOut: true,
                            prompt: "Checkin comment"
                        }
                    ) || "";
                }
            }

            let coArgs = coArgTmpl.replace("${filename}", '"' + path + '"')
                                  .replace("${comment}", '"' + comment + '"');
            exec("cleartool ci " + coArgs, (error, stdout, stderr) => {
                this.m_updateEvent.fire();
            });            
        }        
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

    public hasConfigspec(): boolean
    {
        try{
            if( workspace.rootPath !== undefined )
            {
                execSync("cleartool catcs", {cwd:workspace.rootPath});
                return true;
            }
            return false;
        }
        catch(error)
        {
            return false;
        }
    }

    /**
     * Returns whether the given file object a clearcase object.
     *
     * @param iUri the uri of the file object to be checked
     */
    public async isClearcaseObject(iUri:Uri): Promise<boolean>
    {
        try
        {
            return ("" !== await this.getVersionInformation(iUri));
        }
        catch(error)
        {
            return false;
        }
    }

    /**
     * Retruns a promise promise which will contain a branch information in
     * case the file object is a clearcase object.
     * The string is empty if not.
     *
     * @param iUri the uri of the file object to be checked
     * @returns Promise<string>
     */
    public async getVersionInformation(iUri:Uri): Promise<string>
    {
        return new Promise<string>((resolve, reject) => {
            if( iUri === undefined )
                reject("");

            exec(`cleartool ls -short ${iUri.fsPath}`, (error, stdout, stderr) => {
                if(error || stderr)
                {
                    reject("");
                }
                else
                {
                    let version:string = this.getVersionString(stdout)
                    if( version === "" )
                        reject("");
                    else
                        resolve(version);
                }
            });
        });
    }

    /**
     * Given a string as it is returned by cleartool ls -short, this function
     * can return the version information of that string
     *
     * @param iFileInfo a string with filename and version information
     * @returns string
     */
    public getVersionString(iFileInfo:string)
    {
        if( iFileInfo !== undefined && iFileInfo !== null && iFileInfo !== "" )
        {
            let res = iFileInfo.split("@@");
            if( res.length > 1 )
            {
                return res[1].replace(/\\/g, "/").trim();
            }
        }
        return "";
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
                        this.m_updateEvent.fire();
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

    async getCurrentActivity() : Promise<string> {
        let cmd = 'cleartool lsactivity -cac -fmt "%n"';

        return new Promise<string>((resolve,reject) => {
            exec(cmd, {cwd:workspace.rootPath}, (error, stdout, stderr) => {
                    if ( error )
                        reject();
                    else
                        if( stderr )
                            reject();
                        else
                            resolve(stdout);
                });
        });        
    }

    // return view activities as QuickPickItem list
    async getQuickPickActivities(currentAcvtId: string) : Promise<QuickPickItem[]> {
        let cmd = "cleartool lsactivity";

        return new Promise<QuickPickItem[]>((resolve,reject) => {
            exec(cmd, {maxBuffer:10485760, cwd:workspace.rootPath}, (error, stdout, stderr) => {
                    if ( error ) {
                        reject();
                    } else {
                        if( stderr ) {
                            reject();
                        } else {

                            let lines = stdout.split(/[\n\r]+/);
                            let items: QuickPickItem[] = [];
                            for (let index = 0; index < lines.length; index++) {
                                let parts = lines[index].split(" ");                                
                                if ( parts.length >= 7 ) {
                                    let actv_id = parts[2];
                                    let actv_lb = parts.slice(7).join(" ");

                                    if ( actv_id === currentAcvtId ) {
                                        actv_lb = '\u2713 ' + actv_lb;
                                    } else {
                                        actv_lb = '\u2610 ' + actv_lb;
                                    }

                                    items.push({
                                        label: actv_lb,
                                        description: "",
                                        detail: actv_id});
                                }
                            }

                            resolve(items);
                        }
                    }
                });                                                
        });
    }

    async changeCurrentActivity() {
        try
        {
            let currentActv = await this.getCurrentActivity();
            let userChoose = await window.showQuickPick<QuickPickItem>(
                this.getQuickPickActivities(currentActv)
            );

            if ( userChoose ) {
                if ( currentActv == userChoose.detail )
                    this.setViewActivity(null);
                else
                    this.setViewActivity(userChoose.detail);
            }
        }
        catch(error)
        {
            error = error.replace(/[\r\n]+/g, " ");
            window.showErrorMessage(error);
        }        
    }  
    
    async setViewActivity(actvID: String)
    {
        var cmd = 'cleartool setactivity ';
        if ( actvID )
            cmd += actvID;
        else
            cmd += "-none";

        return new Promise<string>((resolve,reject) => {
            exec(cmd, {cwd:workspace.rootPath}, (error, stdout, stderr) => {
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
}

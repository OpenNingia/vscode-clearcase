'use strict';
import { exec, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import { type } from 'os';
// import * as fsPromise from 'fs-promise';
import { dirname, join } from 'path';

import * as tmp from 'tmp';
import { Event, EventEmitter, ExtensionContext, OutputChannel, QuickPickItem, TextDocument, TextEditor, Uri, window, workspace, InputBox } from 'vscode';
import { CCAnnotationController } from './ccAnnotateController';
import { CCConfigHandler } from './ccConfigHandler';
import { MappedList } from './mappedlist';

export enum EventActions {
  add = 0,
  remove = 1
}

export class EventArgs {

  fileObject: Uri|undefined;
  action: EventActions|undefined;
}

export enum ViewType {
  unknown,
  dynamic,
  snapshot,
  webview
}

export class CCArgs {
  public params: string [] = [];
  private file: string|undefined= undefined;

  public constructor(params: string[], file?:string) {
    this.params = [...params];
    if(file) {
      this.file = file;
    }
  }

  public toString(): string {
    return this.params.reduce((a:string, s:string) => `${a} ${s}`) + ` ${this.file}`;
  }

  public getCmd(): string[] {
    if(this.file !== undefined) {
      return [...this.params, this.file];
    }
    return this.params;
  }
  
  public get File() : string|undefined {
    return this.file;
  }

  public set File(v : string|undefined) {
    this.file = v;
  }
}

export interface CleartoolIf {
  Executable(val?:string|undefined): string;
  Credentials(): string[];
}

export class Cleartool implements CleartoolIf{
  private m_username: string;
  private m_password: string;
  private m_address: string;
  private m_executable: string;
  public constructor(u:string="",p:string="",a:string="",e:string="") {
    this.m_address = a;
    this.m_password = p;
    this.m_username = u;
    this.m_executable = "";
    if( e !== "" ) {
      this.Executable(e);
    } else {
      this.Executable("cleartool");
    }
  }

  public Executable(val?:string|undefined): string {
    if( val !== undefined ) {
      this.m_executable = val;
    }
    return this.m_executable;
  }

  public Credentials(): string[] {
    if( this.m_address !== "" )
      return ["-lname", this.m_username, "-password", this.m_password, "-server", this.m_address];
    return [];
  }
}

export class ClearCase {
  private readonly lsView: string[] = ['lsview', '-cview', '-long'];

  private readonly rxViewType = new RegExp('\\.(vws|stg)$', 'i');
  private readonly rxViewAttr = new RegExp('(view attributes\\:)([\\,\\t \\w\\d]*)(webview)', 'i');

  private mIsCCView: boolean = false;
  private mViewType: ViewType;
  private mUpdateEvent: EventEmitter<Uri>;

  private mUntrackedList: MappedList;
  private m_execCmd: CleartoolIf;
  private m_retryViewDetection = true;

  private m_webviewPassword: string = "";

  public constructor(private mContext: ExtensionContext,
    private configHandler: CCConfigHandler,
    private outputChannel: OutputChannel) {
    this.mUpdateEvent = new EventEmitter<Uri>();
    this.mViewType = ViewType.unknown;
    this.mUntrackedList = new MappedList();

    if( this.configHandler.configuration.UseRemoteClient.value === true ) {
      this.m_execCmd = new Cleartool(this.configHandler.configuration.WebserverUsername.value,
                                     this.m_webviewPassword,
                                     this.configHandler.configuration.WebserverAddress.value,
                                     this.configHandler.configuration.executable.value);
    } else {
      this.m_execCmd = new Cleartool();
    }
    this.configHandler.onDidChangeConfiguration((datas: string[]) => {
      let hasChangedUseRemote = datas.find((val) => {
        return (val === "useRemoteClient");
      });

      let hasChangedExec = datas.find((val) => {
        return (val === "cleartoolExecutable");
      });
      if( hasChangedUseRemote !== undefined )
      {
        window.showWarningMessage("The usewebview config date has changed! Please reload window to set changes active.");
      }
      if( hasChangedExec !== undefined )
      {
        this.m_execCmd.Executable(this.configHandler.configuration.executable.value);
      }
    });
  }

  public get isView(): boolean {
    return this.mIsCCView;
  }

  public get viewType(): ViewType {
    return this.mViewType;
  }

  public get onCommandExecuted(): Event<Uri> {
    return this.mUpdateEvent.event;
  }

  public get untrackedList(): MappedList {
    return this.mUntrackedList;
  }

  public set Password(val:string) {
    this.m_webviewPassword = val;
    if( this.configHandler.configuration.UseRemoteClient.value === true ) {
      this.m_execCmd = new Cleartool(this.configHandler.configuration.WebserverUsername.value,
                                     this.m_webviewPassword,
                                     this.configHandler.configuration.WebserverAddress.value,
                                     this.configHandler.configuration.executable.value);
    }
  }

  /**
   * Checks if the file itself is a clearcase object or if it's in a
   * clearcase view
   *
   * @param editor current editor instance
   */
  public async checkIsView(editor: TextEditor|undefined): Promise<boolean> {
    let isView: boolean = false;
    if (editor !== undefined && editor.document !== undefined) {
      try {
        isView = await this.isClearcaseObject(editor.document.uri);
      }
      catch (error) {
        isView = false;
        // can happen i.e. with a new file which has not been save yet
        //this.m_isCCView = await this.hasConfigspec();
      }
    }

    if (!isView) {
      isView = await this.hasConfigspec();
    }
    if (isView) {
      this.mViewType = await this.detectViewType();
    }

    this.mIsCCView = isView;

    return isView;
  }

  public async loginWebview(): Promise<boolean> {
    try {
      const args: CCArgs = new CCArgs(["login"].concat(this.m_execCmd.Credentials()));
      const path: string = workspace.workspaceFolders !== undefined ? workspace.workspaceFolders[0].uri.fsPath : "";

      await this.runCleartoolCommand(args, path, (datas) => {
        this.outputChannel.appendLine(datas.join(" "));
        return true;
      });
    } catch(err) {
      this.outputChannel.append(`Error while login ${err}`);
    }
    return false;
  }

  public async execOnSCMFile(doc: Uri, func: (arg: Uri) => void) {
    var path = doc.fsPath;
    var self = this;

    await this.runCleartoolCommand(
      new CCArgs(["ls"], path),
      dirname(path),
      null,
      (result: string) => {
        func.apply(self, [doc]);
      },
      (error: string) => {
        this.outputChannel.appendLine(`clearcase, exec error: ${error}`);
        window.showErrorMessage(`${path} is not a valid ClearCase object.`);
      }
    );
  }

  public runClearCaseExplorer(doc: Uri) {
    var path = doc.fsPath;
    exec("clearexplorer \"" + path + "\"");
  }

  public async checkoutFile(doc: Uri): Promise<boolean> {
    var path = doc.fsPath;
    let useClearDlg = this.configHandler.configuration.useClearDlg.value;
    let coArgTmpl = this.configHandler.configuration.checkoutCommand.value;
    let defComment = this.configHandler.configuration.defaultComment.value;

    if (useClearDlg) {
      exec("cleardlg /checkout \"" + path + "\"", (error, stdout, stderr) => {
        this.mUpdateEvent.fire(doc);
      });
      return true;
    } else {

      let comment = "";
      let cmdOpts = coArgTmpl.trim().split(/\s+/);
      let idx = cmdOpts.indexOf("${comment}");
      if (idx > -1) {
        if (defComment) {
          comment = defComment;
        } else {
          comment = await window.showInputBox(
            {
              ignoreFocusOut: true,
              prompt: "Checkout comment"
            }
          ) || "";
        }
        cmdOpts[idx] = comment;
      }
      else {
        let pI = cmdOpts.indexOf("-comment");
        if (pI > -1) {
          cmdOpts.splice(pI, 1);
        }
        pI = cmdOpts.indexOf("-c");
        if (pI > -1) {
          cmdOpts.splice(pI, 1);
        }
        pI = cmdOpts.indexOf("-nc");
        if (pI === -1) {
          cmdOpts.push("-nc");
        }
      }
      let cmd: CCArgs = new CCArgs(["co"]);
      cmd.params = cmd.params.concat(cmdOpts);
      idx = cmd.params.indexOf("${filename}");
      if (idx > -1) {
        cmd.params[idx] = this.wslPath(path, false);
      }
      else {
        cmd.File = path;
      }
      try {
        await this.runCleartoolCommand(cmd, dirname(path), (data: string[]) => {
        });
        this.mUpdateEvent.fire(doc);
      }
      catch (error) {
        this.outputChannel.appendLine("Clearcase error: runCleartoolCommand: " + error);
        return false;
      }
      return true;
    }
  }

  public checkoutAndSaveFile(doc: TextDocument) {
    let path = doc.fileName;
    exec("cleardlg /checkout \"" + path + "\"", (error, stdout, stderr) => {
      // only trigger save if checkout did work
      // If not and the user canceled this dialog the save event is
      // retriggered because of that save.
      if (this.isReadOnly(doc) === false) {
        doc.save();
        this.mUpdateEvent.fire(doc.uri);
      } else {
        window.showErrorMessage('Could not save file.');
      }
    });
  }

  public async undoCheckoutFile(doc: Uri) {
    var path = doc.fsPath;
    let useClearDlg = this.configHandler.configuration.useClearDlg.value;
    if (useClearDlg) {
      exec("cleardlg /uncheckout \"" + path + "\"", (error, stdout, stderr) => {
        this.mUpdateEvent.fire(doc);
      });
    } else {
      let uncoKeepFile = this.configHandler.configuration.uncoKeepFile.value;
      let rm = "-rm";
      if( uncoKeepFile ) {
        rm ="-keep";
      }
      await this.runCleartoolCommand(new CCArgs(["unco", rm], path), dirname(path), (data: string[]) => {
        this.mUpdateEvent.fire(doc);
      });
    }
  }

  public async createVersionedObject(doc: Uri) {
    var path = doc.fsPath;
    await this.runCleartoolCommand(new CCArgs(["mkelem", "-mkp", "-nc"], path), dirname(path), (data: string[]) => {
      this.mUpdateEvent.fire(doc);
    });
  }

  public async checkinFile(doc: Uri) {
    var path = doc.fsPath;
    let useClearDlg = this.configHandler.configuration.useClearDlg.value;
    let ciArgTmpl = this.configHandler.configuration.checkinCommand.value;
    let defComment = this.configHandler.configuration.defaultComment.value;

    if (useClearDlg) {
      exec("cleardlg /checkin \"" + path + "\"", (error, stdout, stderr) => {
        this.mUpdateEvent.fire(doc);
      });
    } else {

      let comment = "";
      let cmdOpts = ciArgTmpl.trim().split(/\s+/);
      let idx = cmdOpts.indexOf("${comment}");
      if (idx > -1) {

        if (defComment) {
          comment = defComment;
        } else {
          comment = await window.showInputBox(
            {
              ignoreFocusOut: true,
              prompt: "Checkin comment"
            }
          ) || "";
        }
        cmdOpts[idx] = comment;
      }
      else {
        let pI = cmdOpts.indexOf("-comment");
        if (pI > -1) {
          cmdOpts.splice(pI, 1);
        }
        pI = cmdOpts.indexOf("-c");
        if (pI > -1) {
          cmdOpts.splice(pI, 1);
        }
        pI = cmdOpts.indexOf("-nc");
        if (pI === -1) {
          cmdOpts.push("-nc");
        }
      }

      let cmd: CCArgs = new CCArgs(["ci"], path);
      cmd.params = cmd.params.concat(cmdOpts);
      idx = cmd.params.indexOf("${filename}");
      if (idx > -1) {
        cmd.params[idx] = this.wslPath(path, false);
      }
      else {
        cmd.File = path;
      }

      await this.runCleartoolCommand(cmd, dirname(path), (data: string[]) => {
        this.mUpdateEvent.fire(doc);
      });
    }
  }

  public async checkinFiles(fileObjs: Uri[], comment: string): Promise<void> {
    for (let i = 0; i < fileObjs.length; i++) {
      let cmd: CCArgs = new CCArgs(["ci", "-nc"], fileObjs[i].fsPath);
      if (comment !== "") {
        cmd.params = ["ci", "-c", comment];
      }
      if( workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0 ) {
        await this.runCleartoolCommand(cmd, workspace.workspaceFolders[0].uri.fsPath, (data: string[]) => {
          this.outputChannel.appendLine(`ClearCase checkin: ${data[0]}`);
        });
      }
    }
  }

  public versionTree(doc: Uri) {
    var path = doc.fsPath;
    this.runCleartoolCommand(new CCArgs(["lsvtree", "-graphical"], path), dirname(path), null);
  }

  public diffWithPrevious(doc: Uri) {
    var path = doc.fsPath;
    this.runCleartoolCommand(new CCArgs(["diff", "-graph", "-pred"], path), dirname(path), null);
  }

  /**
   * Searching checkout files in all vobs of the current view
   */
  public async findCheckouts(): Promise<string[]> {
    let lscoArgTmpl = this.configHandler.configuration.findCheckoutsCommand.value;
    let resNew: string[] = [];
    let wsf = "";
    if( workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0 ) {
      wsf = workspace.workspaceFolders[0].uri.fsPath;
    }
    try {
      let runInWsl = this.isRunningInWsl();
      let cmdOpts = lscoArgTmpl.split(' ');
      let cmd: CCArgs = new CCArgs(["lsco", ...cmdOpts]);
      await this.runCleartoolCommand(cmd, wsf, null, (result: string) => {
        if( result.length > 0 ) {
          let results: string[] = result.trim().split(/\r\n|\r|\n/);
          resNew =  results.map((e) => {
            if (e.startsWith("\\") && type() === "Windows_NT") {
              e = (e.replace("\\", wsf.toUpperCase()[0] + ":\\"));
            }
            if(runInWsl === true) {
              // e = this.wslPath(e, true, runInWsl);
              e = e.replace(/\\/g, '/').replace(/^([A-Za-z])\:/, (s:string, g1:string) => `/mnt/${g1.toLowerCase()}`);
            }
            return e;
          });
        }
      });
    }
    catch (error:any) {
      if( error !== undefined ) {
        this.outputChannel.appendLine(error);
      }
    }
    return resNew;
  }

  /**
   * Searching view private objects in all workspace folders of the current project.
   * The result is filtered by the configuration 'ViewPrivateFileSuffixes'
   */
  public async findUntracked(pathObj: Uri|undefined): Promise<void> {
    try {
      if (pathObj === undefined) {
        return;
      }
      let cmd: CCArgs = new CCArgs(["ls", "-view_only", "-short", "-r"]);
      await this.runCleartoolCommand(cmd, pathObj.fsPath, (data: string[]) => {
        data.forEach((val) => {
          let f = val;
          if( val.match(/@@/g) !== null ) {
            let p = val.split("@@");
            if( p[1].match(/checkedout/gi) === null )
            {
              f = p[0];
            }
            else
            {
              f = "";
            }
          }
          if( f !== "" ) {
            let p = join(pathObj.fsPath, f);
            this.untrackedList.addStringByKey(p, pathObj.fsPath);
          }
        });
      });
    }
    catch (error:any) {
      this.outputChannel.appendLine(error);
    }
  }

  public findCheckoutsGui(path: string) {
    exec("clearfindco \"" + path + "\"");
  }

  public findModified(path: string) {
    exec("clearviewupdate -pname \"" + path + "\" -modified");
  }

  public updateView() {
    exec("clearviewupdate");
  }

  /**
   * Alternate methode detecting if the given path is part of an clearcase
   * view.
   */
  public async hasConfigspec(): Promise<boolean> {
    try {
      if ( workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
        let cmd: CCArgs = new CCArgs(["catcs"]);
        await this.runCleartoolCommand(cmd, workspace.workspaceFolders[0].uri.fsPath, (data) => {
        });
        return true;
      }
      return false;
    }
    catch (error) {
      return false;
    }
  }

  /**
   * Returns whether the given file object a clearcase object.
   *
   * @param iUri the uri of the file object to be checked
   */
  public async isClearcaseObject(iUri: Uri): Promise<boolean> {
    try {
      return ("" !== await this.getVersionInformation(iUri));
    }
    catch (error) {
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
  public async getVersionInformation(iUri: Uri, normalize: boolean = true): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      if (iUri === undefined || workspace.workspaceFolders === undefined) {
        reject("");
      } else {
        let fileVers: string = "";
        await this.runCleartoolCommand(
          new CCArgs(["ls", "-d", "-short"], iUri.fsPath), workspace.workspaceFolders[0].uri.fsPath,
          null,
          (result: string) => {
            fileVers = this.getVersionString(result, normalize);
          },
          (error: string) => {
            this.outputChannel.appendLine(`clearcase, exec error: ${error}`);
            fileVers = "?"
          }          
        );
        resolve(fileVers);
      }
    });
  }

  /**
   * Given a string as it is returned by cleartool ls -short, this function
   * can return the version information of that string
   *
   * @param iFileInfo a string with filename and version information
   * @returns string
   */
  public getVersionString(iFileInfo: string, normalize: boolean) {
    if (iFileInfo !== undefined && iFileInfo !== null && iFileInfo !== "") {
      let res = iFileInfo.split("@@");
      if (res.length > 1) {
        return normalize ? res[1].replace(/\\/g, "/").trim() : res[1].trim();
      }
    }
    return "";
  }

  public async updateDir(uri: Uri) {
    try {
      let msg: string|undefined = await this.updateObject(uri, 0);
      window.showInformationMessage(`Update of ${msg} finished!`);
    }
    catch (error:any) {
      window.showErrorMessage(error);
    }
  }

  public async updateFile(uri: Uri) {
    try {
      let msg: string|undefined = await this.updateObject(uri, 1);
      window.showInformationMessage(`Update of ${msg} finished!`);
    }
    catch (error:any) {
      window.showErrorMessage(error);
    }
  }

  /**
   * @param filePath Uri of the selected file object in the explorer
   * @param updateType which one to update: 0=directory, 1=file
   */
  public async updateObject(filePath: Uri, updateType: number): Promise<string|undefined> {
    let resultOut: string = "";

    if( window.activeTextEditor !== undefined ) {
      let p = ((filePath === null || filePath === undefined || filePath.fsPath === null) ?
        window.activeTextEditor.document.fileName : filePath.fsPath);
      
      let stat = fs.lstatSync(p);
      let path = "";

      if (stat.isDirectory()) {
        path = p;
      }
      else if (stat.isFile()) {
        path = (updateType === 0 ? dirname(p) : p);
      }
      if (path !== "") {
        path = `"${path}"`;
      }

      let errorRes: string = "";
      await this.runCleartoolCommand(
        new CCArgs(["update"], path),
        dirname(path),
        (data: string[]) => {
          this.mUpdateEvent.fire(filePath);
        },
        (result: string) => {
          resultOut = result;
        },
        (error: string) => {
          errorRes = error;
        }
      );
      if( errorRes.length > 0 ) {
        throw new Error(errorRes);
      }
    }

    return resultOut;
  }

  public itemProperties(doc: Uri) {
    var path = doc.fsPath;
    exec("cleardescribe \"" + path + "\"");
  }

  async annotate(fileUri: Uri, ctrl: CCAnnotationController): Promise<any> {
    try {
      let content = await this.getAnnotatedFileContent(fileUri.fsPath);
      ctrl.setAnnotationInText(content);
    }
    catch (error:any) {
      error = error.replace(/[\r\n]+/g, " ");
      window.showErrorMessage(error);
    }
  }

  public async getAnnotatedFileContent(filePath: string): Promise<string> {
    let resultOut: string = "";
    if (workspace.workspaceFolders !== undefined) {
      let errorRes: string = "";
      let fmt = this.configHandler.configuration.annotationFormatString.value;
      let sep = " | ";
      let fileP = this.wslPath(filePath, false);

      await this.runCleartoolCommand(
        new CCArgs(["annotate", "-out", "-", "-nhe", "-fmt", `"${fmt}${sep}"`, `${fileP}`]),
        workspace.workspaceFolders[0].uri.fsPath,
        null,
        (result: string) => {
          resultOut = result;
        },
        (error: string) => {
          errorRes = error;
        }
      );
      if( errorRes.length > 0 ) {
        throw new Error(errorRes);
      }
    }
    return resultOut;
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

  async getCurrentActivity(): Promise<string> {
    let resultOut: string = "";
    if (workspace.workspaceFolders !== undefined) {
      let errorRes: string = "";
      await this.runCleartoolCommand(
        new CCArgs(["lsactivity", "-cac", "-fmt", `"%n"`]),
        workspace.workspaceFolders[0].uri.fsPath,
        null,
        (result: string) => {
          resultOut = result;
        },
        (error: string) => {
          errorRes = error;
        }
      );
      if( errorRes.length > 0 ) {
        throw new Error(errorRes);
      }
    }
    return resultOut;
  }

  // return view activities as QuickPickItem list
  async getQuickPickActivities(currentAcvtId: string): Promise<QuickPickItem[]> {
    let resultOut: QuickPickItem[] = [];
    if (workspace.workspaceFolders !== undefined) {
      let errorRes: string = "";
      await this.runCleartoolCommand(
        new CCArgs(["lsactivity"]),
        workspace.workspaceFolders[0].uri.fsPath,
        null,
        (result: string) => {
          let lines = result.split(/[\n\r]+/);
          for (let index = 0; index < lines.length; index++) {
            let parts = lines[index].split(" ");
            if (parts.length >= 7) {
              let actvId = parts[2];
              let actvLb = parts.slice(7).join(" ");

              if (actvId === currentAcvtId) {
                actvLb = '\u2713 ' + actvLb;
              } else {
                actvLb = '\u2610 ' + actvLb;
              }

              resultOut.push({
                label: actvLb,
                description: "",
                detail: actvId
              });
            }
          }
        },
        (error: string) => {
          errorRes = error;
        }
      );
      if( errorRes.length > 0 ) {
        throw new Error(errorRes);
      }
    }
    return resultOut;
  }

  async changeCurrentActivity() {
    try {
      let currentActv = await this.getCurrentActivity();
      let userChoose = await window.showQuickPick<QuickPickItem>(
        this.getQuickPickActivities(currentActv)
      );

      if (userChoose) {
        if (currentActv === userChoose.detail) {
          this.setViewActivity(undefined);
        } else {
          this.setViewActivity(userChoose.detail);
        }
      }
    }
    catch (error:any) {
      error = error.replace(/[\r\n]+/g, " ");
      window.showErrorMessage(error);
    }
  }

  public async setViewActivity(actvID: string|undefined): Promise<string> {
    let resultOut: string = "";
    if (workspace.workspaceFolders !== undefined) {
      let errorRes: string = "";
      let id:string = "-none";
      if (actvID !== undefined) {
        id = actvID;
      }
      await this.runCleartoolCommand(
        new CCArgs(["setactivity", `${id}`]),
        workspace.workspaceFolders[0].uri.fsPath,
        null,
        (result: string) => {
          resultOut = result;
        },
        (error: string) => {
          errorRes = error;
        }
      );
      if( errorRes.length > 0 ) {
        throw new Error(errorRes);
      }
    }
    return resultOut;
  }

  public async readFileAtVersion(fsPath: string, version: string): Promise<string> {
    // cannot call getFileAtVersion because the temp file is automatically removed
    let tempDir = this.configHandler.configuration.tempDir.value;
    let tempFile = "";
    let ret = undefined;
    let pname = fsPath + "@@" + version;
    let isWsl = this.isRunningInWsl();
    if( isWsl === true ) {
      tempDir = this.wslPath(tempDir, true, isWsl);
      tempFile = tmp.tmpNameSync({tmpdir: tempDir});
      ret = Uri.file(tempFile);
      tempFile = this.wslPath(tempFile, false, isWsl);
    } else {
      tempFile = tmp.tmpNameSync({tmpdir: tempDir});
      ret = Uri.file(tempFile);
    }
    if( workspace.workspaceFolders !== undefined ) {
      await this.runCleartoolCommand(
        new CCArgs(['get', '-to', tempFile], pname),
        workspace.workspaceFolders[0].uri.fsPath,
        (data: string[]) => { },
        (result: string) => {
          console.log(result);
        });
    }
    return fs.readFileSync(ret.fsPath, { encoding: 'utf-8' });
  }

  private runCleartoolCommand(cmd: CCArgs, cwd: string, onData: ((data: string[]) => void)|null, onFinished?: (result:string) => void, onError?: (result:string) => void): Promise<void> {
    let self: ClearCase = this;
    let executable:string = this.m_execCmd.Executable();
    try{
      fs.accessSync(cwd, fs.constants.F_OK);
    } catch(err) {
      self.outputChannel.appendLine(`CWD (${cwd}) not found`);
      return Promise.reject();
    }
    // convert path to run cleartool windows cmd
    if( cmd.File ) {
      // wsl mount point for external drives is /mnt
      // convert backslash to slash
      cmd.File = self.wslPath(cmd.File, false);
    }
    if( cmd.File !== undefined && !fs.existsSync(cmd.File) ) {
      return Promise.reject();
    }

    // tslint:disable-next-line:typedef
    return new Promise<void>(async function (resolve, reject): Promise<void> {
      let cmdErrMsg: string = "";

      self.outputChannel.appendLine(cmd.getCmd().toString());
      let allData: Buffer = Buffer.alloc(0);
      let allDataStr: string = "";
      const command = spawn(executable, cmd.getCmd(), { cwd: cwd, env: process.env });

      command.stdout.on('data', (data) => {
        let res: string = "";
        if (typeof data === 'string') {
          res = data;
          allDataStr += data;
        } else {
          allData = Buffer.concat([allData, data], (allData.length+data.length));
          res = data.toString();
        }
        if( onData !== null && typeof onData === "function" ) {
          onData(res.split(/\r\n|\r|\n/).filter((s:string) => s.length > 0));
        }
      });

      command.stderr.on('data', (data) => {
        let msg: string;
        if (typeof data === 'string') {
          msg = data;
        } else {
          msg = data.toString();
        }
        if( onError !== undefined && typeof onError === "function" ) {
          onError(msg);
        } else {
          cmdErrMsg = `${cmdErrMsg}${msg}`;
        }
      });

      command.on('close', (code) => {
        if (code !== 0) {
          self.outputChannel.appendLine(cmdErrMsg);
          if( self.isView && cmdErrMsg !== "" ) {
            window.showErrorMessage(`${cmdErrMsg}`, {modal: false});
          }

        } else {
          if (typeof onFinished === 'function') {
            onFinished((allData.length > 0) ? allData.toString() : allDataStr);
          }
        }
        resolve();
      });

      command.on('error', (error) => {
        let msg = `Cleartool error: Cleartool command error: ${error.message}`;
        self.outputChannel.appendLine(msg);
        reject(error.message);
      });
    });
  }

  private async detectViewType(): Promise<ViewType> {
    let lines: string[] = [];
    let viewType: ViewType = ViewType.unknown;

    let filterGlobalPathLines = (l: string) => {
      if (l.length === 0) {
        return false;
      }
      let ma: RegExpMatchArray | null = l.match(this.rxViewType);
      return !!ma && (ma.length > 0);
    };
    if( workspace.workspaceFolders !== undefined )
    {
      await this.runCleartoolCommand(new CCArgs(this.lsView), workspace.workspaceFolders[0].uri.fsPath, (data: string[]) => {
        // lines = lines.concat(data);
      }, (result: string) => {
        lines = result.split(/\r\n|\r|\n/).filter(s => s.length>0);
        let resLines: string[] = lines.filter(filterGlobalPathLines);
        if (resLines.length === 0) {
          return;
        }
        if (resLines[0].endsWith('.vws')) {
          viewType = ViewType.dynamic;
        } else {
          viewType = ViewType.snapshot;
          if( resLines.length > 1 && resLines[1].match(/webview/i) ) {
            viewType = ViewType.webview;
          }
        }
      });
    }
    return viewType;
  }

  public isRunningInWsl(): boolean {
    return this.configHandler.configuration.isWslEnv.value;

    if(type() !== "Windows_NT") {
      // check if wslpath executeable is available
      try{
        fs.accessSync("/usr/bin/wslpath", fs.constants.R_OK);
      } catch {
        return false;
      }
    } else {
      return false;
    }
    return true;
  }

  /**
   * Run the `ct edcs` command and return handles to answer with yes / no.
   * @param baseFolder a string with the base folder for `ct edcs` operation
   * @param dialogBox a reference to a vs code InputBox for problem handling
   * @returns ChildProcess
   */
  public async runClearTooledcs(baseFolder: string): Promise<ChildProcess>{
    let executable = this.configHandler.configuration.executable.value;
    process.env.VISUAL = 'code -r';
    var options = {
      cwd: baseFolder,
      env: process.env
    };
    return new Promise<ChildProcess>((resolve, reject) => {
      let child: ChildProcess = exec(`${executable} edcs`, options, (error, stdout, stderr) => {
        if (error || stderr) {
          if (error) {
            this.outputChannel.appendLine(`cleartool edcs error: ${error.message}`);
            reject(error.message);
          } else {
            this.outputChannel.appendLine(`cleartool edcs stderr: ${stderr}`);
            reject(stderr);
          }
        } else {
          //resolve(stdout);
        }
      });
      resolve(child);
    });
  }

  public wslPath(path: string, toLinux:boolean=true, runInWsl?:boolean): string {
    if( runInWsl === undefined ) {
      runInWsl = this.isRunningInWsl();
    }
    if(runInWsl === true) {
      if( toLinux === true) {
        return path.replace(/\\/g, '/').replace(/^([A-Za-z])\:/, (s:string, g1:string) => `/mnt/${g1.toLowerCase()}`);
      } else {
        return path.replace(/^\/mnt\/([A-Za-z])/, `$1:`).replace(/\//g, '\\');
      }
    }
    return path;
  }

}

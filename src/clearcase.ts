'use strict';
// The module ' contains the VS Code extensibility API
// Import the module and reference it with the alias in your code below
import {
  ExtensionContext, window, workspace, Uri,
  TextEditor, TextDocument,
  EventEmitter, Event, QuickPickItem, OutputChannel
} from 'vscode'
import { exec, spawn } from 'child_process'
import * as fs from 'fs';
import { dirname, join } from 'path';
import { ccCodeLensProvider } from "./ccAnnotateLensProvider";
import { ccAnnotationController } from './ccAnnotateController'
import { ccConfigHandler } from './ccConfigHandler';

export enum EventActions {
  Add = 0,
  Remove = 1
}

export class EventArgs {

  fileObject: Uri;
  action: EventActions;
}

export enum ViewType {
  UNKNOWN,
  DYNAMIC,
  SNAPSHOT
}

export class ClearCase {
  private readonly LS_VIEW: string[] = ['lsview', '-cview', '-long'];

  private readonly rxViewType = new RegExp('\\.(vws|stg)$', 'i');


  private m_isCCView: boolean;
  private m_viewType: ViewType;
  private m_updateEvent: EventEmitter<Uri>;

  public constructor(private m_context: ExtensionContext,
    private configHandler: ccConfigHandler,
    private outputChannel: OutputChannel) {
    this.m_updateEvent = new EventEmitter<Uri>();
    this.m_viewType = ViewType.UNKNOWN;
  }

  public get IsView(): boolean {
    return this.m_isCCView;
  }

  public get ViewType(): ViewType {
    return this.m_viewType;
  }

  public get onCommandExecuted(): Event<Uri> {
    return this.m_updateEvent.event;
  }

  /**
   * Checks if the file itself is a clearcase object or if it's in a
   * clearcase view
   *
   * @param editor current editor instance
   */
  public async checkIsView(editor: TextEditor) {
    if (editor !== null && editor !== undefined && editor.document !== undefined) {
      try {
        this.m_isCCView = await this.isClearcaseObject(editor.document.uri);
        if (this.m_isCCView === false)
          this.m_isCCView = await this.hasConfigspec();
      }
      catch (error) {
        // can happen i.e. with a new file which has not been save yet
        this.m_isCCView = await this.hasConfigspec();
      }
    }
    else {
      this.m_isCCView = await this.hasConfigspec();
    }
    this.m_viewType = await this.detectViewType();
  }

  public execOnSCMFile(doc: Uri, func: (string) => void) {
    var path = doc.fsPath;
    var self = this;
    exec("cleartool ls \"" + path + "\"", (error, stdout, stderr) => {
      if (error) {
        this.outputChannel.appendLine(`clearcase, exec error: ${error}`);
        window.showErrorMessage(`${path} is not a valid ClearCase object.`);
        return;
      }
      func.apply(self, [doc]);
      if (stderr)
        this.outputChannel.appendLine(`clearcase, stderr: ${stderr}`);
      else
        this.outputChannel.appendLine(`clearcase, stdout: ${stdout}`);
    });
  }

  public runClearCaseExplorer(doc: Uri) {
    var path = doc.fsPath;
    exec("clearexplorer \"" + path + "\"");
  }

  public async checkoutFile(doc: Uri): Promise<boolean> {
    var path = doc.fsPath;
    let useClearDlg = this.configHandler.configuration.UseClearDlg.Value;
    let coArgTmpl = this.configHandler.configuration.CheckoutCommand.Value;
    let defComment = this.configHandler.configuration.DefaultComment.Value;

    if (useClearDlg) {
      exec("cleardlg /checkout \"" + path + "\"", (error, stdout, stderr) => {
        this.m_updateEvent.fire(doc);
      });
      return true;
    } else {

      let comment = "";
      let cmdOpts = coArgTmpl.split(' ');
      let idx = cmdOpts.indexOf("${comment}");
      if (idx > -1) {
        if (defComment)
          comment = defComment;
        else {
          comment = await window.showInputBox(
            {
              ignoreFocusOut: true,
              prompt: "Checkout comment"
            }
          ) || "";
        }
        cmdOpts[idx] = comment;
      }
      else
      {
        let pI = cmdOpts.indexOf("-comment");
        if( pI > -1 )
        {
          cmdOpts.splice(pI, 1);
        }
        pI = cmdOpts.indexOf("-c");
        if( pI > -1 )
        {
          cmdOpts.splice(pI, 1);
        }
        pI = cmdOpts.indexOf("-nc");
        if( pI == -1 )
          cmdOpts.push("-nc");
      }
      idx = cmdOpts.indexOf("${filename}");
      if( idx > -1 )
        cmdOpts[idx] = path;
      else
        cmdOpts.push(path);

      let cmd: string[] = ["co"];
      cmd = cmd.concat(cmdOpts);

      try
      {
        await this.runCleartoolCommand(cmd, dirname(path), (data: string[]) => {
        });
        this.m_updateEvent.fire(doc);
      }
      catch(error)
      {
        this.outputChannel.appendLine("Clearcase error: runCleartoolCommand: " + error);
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
        this.m_updateEvent.fire(doc.uri);
      } else {
        window.showErrorMessage('Could not save file.');
      }
    });
  }

  public undoCheckoutFile(doc: Uri) {
    var path = doc.fsPath;
    exec("cleartool unco -rm \"" + path + "\"", (error, stdout, stderr) => {
      this.m_updateEvent.fire(doc);
    });
  }

  public async checkinFile(doc: Uri) {
    var path = doc.fsPath;
    let useClearDlg = this.configHandler.configuration.UseClearDlg.Value;
    let ciArgTmpl = this.configHandler.configuration.CheckinCommand.Value;
    let defComment = this.configHandler.configuration.DefaultComment.Value;

    if (useClearDlg) {
      exec("cleardlg /checkin \"" + path + "\"", (error, stdout, stderr) => {
        this.m_updateEvent.fire(doc);
      });
    } else {

      let comment = "";
      let cmdOpts = ciArgTmpl.split(' ');
      let idx = cmdOpts.indexOf("${comment}");
      if (idx > -1) {

        if (defComment)
          comment = defComment;
        else {
          comment = await window.showInputBox(
            {
              ignoreFocusOut: true,
              prompt: "Checkin comment"
            }
          ) || "";
        }
        cmdOpts[idx] = comment;
      }
      else
      {
        let pI = cmdOpts.indexOf("-comment");
        if( pI > -1 )
        {
          cmdOpts.splice(pI, 1);
        }
        pI = cmdOpts.indexOf("-c");
        if( pI > -1 )
        {
          cmdOpts.splice(pI, 1);
        }
        pI = cmdOpts.indexOf("-nc");
        if( pI == -1 )
          cmdOpts.push("-nc");
      }
      idx = cmdOpts.indexOf("${filename}");
      if( idx > -1 )
        cmdOpts[idx] = path;
      else
        cmdOpts.push(path);

      let cmd: string[] = ["ci"];
      cmd = cmd.concat(cmdOpts);

      await this.runCleartoolCommand(cmd, dirname(path), (data: string[]) => {
        this.m_updateEvent.fire(doc);
      });
    }
  }

  public async checkinFiles(fileObjs: Uri[], comment: string): Promise<void> {
    for (let i = 0; i < fileObjs.length; i++) {
      let cmd: string[] = ["ci", "-nc", fileObjs[i].fsPath];
      if (comment != "") {
        cmd = ["ci", "-c", comment, fileObjs[i].fsPath];
      }
      await this.runCleartoolCommand(cmd, workspace.workspaceFolders[0].uri.fsPath, (data: string[]) => {
        this.outputChannel.appendLine(`ClearCase checkin: ${data[0]}`);
      });
    }
  }

  public versionTree(doc: Uri) {
    var path = doc.fsPath;
    exec("cleartool lsvtree -graphical \"" + path + "\"");
  }

  public diffWithPrevious(doc: Uri) {
    var path = doc.fsPath;
    exec("cleartool diff -graph -pred \"" + path + "\"");
  }  

  /**
   * Searching checkout files in all vobs of the current view
   */
  public async findCheckouts(): Promise<string[]> {
    let results: string[] = [];

    await this.runCleartoolCommand(["lsco", "-me", "-cview", "-short", "-avobs"], workspace.workspaceFolders[0].uri.fsPath, (data: string[]) => {
      results = results.concat(data);
    });
    return results;
  }

  /**
   * Searching view private objects in all workspace folders of the current project.
   * The result is filtered by the configuration 'ViewPrivateFileSuffixes'
   */
  public async findUntracked(folder: Uri): Promise<string[]> {
    let results: string[] = [];

    await this.runCleartoolCommand(["ls", "-view_only", "-short", "-r"], folder.fsPath, (data: string[]) => {
      let regex: RegExp = new RegExp(this.configHandler.configuration.ViewPrivateFileSuffixes.Value, "i");
      let res = data.filter((val) => {
        if (val.match(regex) != null) {
          val = join(folder.fsPath, val.trim());
          if( fs.existsSync(val) )
            return val;
        }
      });
      results = results.concat(res);
    });
    return results;
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
      if (workspace.workspaceFolders.length > 0) {
        await exec("cleartool catcs", { cwd: workspace.workspaceFolders[0].uri.fsPath });
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
  public async getVersionInformation(iUri: Uri): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (iUri === undefined)
        reject("");

      exec(`cleartool ls -short ${iUri.fsPath}`, (error, stdout, stderr) => {
        if (error || stderr) {
          if( error)
            reject(error.message);
          else
          reject(stderr);
        }
        else {
          let version: string = this.getVersionString(stdout)
          resolve(version);
        }
      });
    });
  }

  async getClearCaseInfo(): Promise<string> {
    let self = this;
    return new Promise<string>(
      // tslint:disable-next-line:typedef
      function (resolve, reject): void {
        exec('cleartool -verAll', (err: Error, output: string) => {
          if (err) {
            let msg = 'ClearCase not found!';
            self.outputChannel.appendLine(msg);
            self.outputChannel.show(true);
            reject(msg);
          }
          resolve(output);
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
  public getVersionString(iFileInfo: string) {
    if (iFileInfo !== undefined && iFileInfo !== null && iFileInfo !== "") {
      let res = iFileInfo.split("@@");
      if (res.length > 1) {
        return res[1].replace(/\\/g, "/").trim();
      }
    }
    return "";
  }

  public async updateDir(uri: Uri) {
    try {
      let msg: string = await this.updateObject(uri, 0);
      window.showInformationMessage(`Update of ${msg} finished!`);
    }
    catch (error) {
      window.showErrorMessage(error);
    }
  }

  public async updateFile(uri: Uri) {
    try {
      let msg: string = await this.updateObject(uri, 1);
      window.showInformationMessage(`Update of ${msg} finished!`);
    }
    catch (error) {
      window.showErrorMessage(error);
    }
  }

  /**
   * @param filePath Uri of the selected file object in the explorer
   * @param updateType which one to update: 0=directory, 1=file
   */
  public async updateObject(filePath: Uri, updateType: number): Promise<string> {
    try {
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
          else {
            reject(error.message);
          }
        });
      })
    } catch (error) {
      throw error.message;
    }
  }

  public itemProperties(doc: Uri) {
    var path = doc.fsPath;
    exec("cleardescribe \"" + path + "\"");
  }

  async annotate(fileUri: Uri, ctrl: ccAnnotationController): Promise<any> {
    try {
      let content = await this.getAnnotatedFileContent(fileUri.fsPath);
      ctrl.setAnnotationInText(content);
    }
    catch (error) {
      error = error.replace(/[\r\n]+/g, " ");
      window.showErrorMessage(error);
    }
  }

  public async getAnnotatedFileContent(filePath: string): Promise<string> {
    let fmt = this.configHandler.configuration.AnnotationFormatString.Value;
    let sep = " | ";
    let param = "\"" + filePath + "\"";
    let cmd = "cleartool annotate -out - -nhe -fmt \"" + fmt + sep + "\" " + param;

    return new Promise<string>((resolve, reject) => {
      exec(cmd, { maxBuffer: 10485760 }, (error, stdout, stderr) => {
        if (error)
          reject(error.message);
        else
          if (stderr)
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

  async getCurrentActivity(): Promise<string> {
    let cmd = 'cleartool lsactivity -cac -fmt "%n"';

    return new Promise<string>((resolve, reject) => {
      exec(cmd, { cwd: workspace.rootPath }, (error, stdout, stderr) => {
        if (error)
          reject();
        else
          if (stderr)
            reject();
          else
            resolve(stdout);
      });
    });
  }

  // return view activities as QuickPickItem list
  async getQuickPickActivities(currentAcvtId: string): Promise<QuickPickItem[]> {
    let cmd = "cleartool lsactivity";

    return new Promise<QuickPickItem[]>((resolve, reject) => {
      exec(cmd, { maxBuffer: 10485760, cwd: workspace.rootPath }, (error, stdout, stderr) => {
        if (error) {
          reject();
        } else {
          if (stderr) {
            reject();
          } else {

            let lines = stdout.split(/[\n\r]+/);
            let items: QuickPickItem[] = [];
            for (let index = 0; index < lines.length; index++) {
              let parts = lines[index].split(" ");
              if (parts.length >= 7) {
                let actv_id = parts[2];
                let actv_lb = parts.slice(7).join(" ");

                if (actv_id === currentAcvtId) {
                  actv_lb = '\u2713 ' + actv_lb;
                } else {
                  actv_lb = '\u2610 ' + actv_lb;
                }

                items.push({
                  label: actv_lb,
                  description: "",
                  detail: actv_id
                });
              }
            }

            resolve(items);
          }
        }
      });
    });
  }

  async changeCurrentActivity() {
    try {
      let currentActv = await this.getCurrentActivity();
      let userChoose = await window.showQuickPick<QuickPickItem>(
        this.getQuickPickActivities(currentActv)
      );

      if (userChoose) {
        if (currentActv == userChoose.detail)
          this.setViewActivity(null);
        else
          this.setViewActivity(userChoose.detail);
      }
    }
    catch (error) {
      error = error.replace(/[\r\n]+/g, " ");
      window.showErrorMessage(error);
    }
  }

  public setViewActivity(actvID: String): Promise<string> {
    var cmd = 'cleartool setactivity ';
    if (actvID)
      cmd += actvID;
    else
      cmd += "-none";

    return new Promise<string>((resolve, reject) => {
      exec(cmd, { cwd: workspace.rootPath }, (error, stdout, stderr) => {
        if (error)
          reject(error.message);
        else
          if (stderr)
            reject(stderr);
          else
            resolve(stdout);
      });
    });
  }

  private runCleartoolCommand(cmd: string[], cwd: string, onData: (data: string[]) => void, onFinished?: () => void): Promise<void> {
    let self: ClearCase = this;
    // tslint:disable-next-line:typedef
    return new Promise<void>(function (resolve, reject): void {
      self.outputChannel.appendLine(cmd.reduce(((val) => { return val + " " })));
      const command = spawn("cleartool", cmd, { cwd: cwd, env: process.env });

      command.stdout.on('data', (data) => {
        if (typeof data === 'string') {
          onData(data.split(/\r\n|\r|\n/).filter(s => s.length > 0));
        } else {
          onData(data.toString().split(/\r\n|\r|\n/).filter(s => s.length > 0));
        }
      });

      command.stderr.on('data', (data) => {
        let msg: string;
        if (typeof data === 'string') {
          msg = data;
        } else {
          msg = data.toString();
        }
        msg = `ClearCase error: ClearCase error: ${msg}`;
        self.outputChannel.appendLine(msg);
      });

      command.on('close', (code) => {
        if (code !== 0) {
          let msg = `Cleartool error: Cleartool command ${cmd} exited with error code: ${code}`;
          self.outputChannel.appendLine(msg);
        } else {
          if (typeof onFinished === 'function') {
            onFinished();
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
    let viewType: ViewType = ViewType.UNKNOWN;

    let filterGlobalPathLines = (l: string) => {
      if (l.length === 0) {
        return false;
      }
      let ma: RegExpMatchArray | null = l.match(this.rxViewType);
      return !!ma && (ma.length > 0);
    };

    await this.runCleartoolCommand(this.LS_VIEW, workspace.workspaceFolders[0].uri.fsPath, (data: string[]) => {
      lines = lines.concat(data);
    }, () => {
      let resLines: string[] = lines.filter(filterGlobalPathLines);
      if (resLines.length === 0) {
        return;
      }
      if (resLines[0].endsWith('.vws')) {
        viewType = ViewType.DYNAMIC;
      } else {
        viewType = ViewType.SNAPSHOT;
      }
    });

    return viewType;
  }
}

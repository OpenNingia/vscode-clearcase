import { exec, spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import { type } from "os";
import { dirname, join } from "path";

import * as tmp from "tmp";
import {
  Event,
  EventEmitter,
  OutputChannel,
  QuickPickItem,
  TextDocument,
  TextEditor,
  Uri,
  window,
  workspace,
} from "vscode";
import { CCAnnotationController } from "./ccAnnotateController";
import { CCConfigHandler } from "./ccConfigHandler";
import { getErrorMessage } from "./errormessage";
import { MappedList } from "./mappedlist";

export enum EventActions {
  add = 0,
  remove = 1,
}

export class EventArgs {
  fileObject: Uri | undefined;
  action: EventActions | undefined;
}

export enum ViewType {
  unknown,
  dynamic,
  snapshot,
  webview,
}

export class CCArgs {
  public params: string[] = [];
  private mFile: string | undefined;
  private mVersion: string | undefined;

  constructor(params: string[], file?: string, version?: string) {
    this.params = [...params];
    this.mFile = file;
    this.mVersion = version;
  }

  private toString(): string {
    return this.params.reduce((a: string, s: string) => `${a} ${s}`) + ` ${this.mFile}`;
  }

  getCmd(): string[] {
    if (this.mFile !== undefined && this.mVersion === undefined) {
      return [...this.params, this.mFile];
    } else if (this.mFile !== undefined && this.mVersion !== undefined && this.mVersion !== "") {
      return [...this.params, `${this.mFile}@@${this.mVersion}`];
    }
    return this.params;
  }

  get file(): string | undefined {
    return this.mFile;
  }

  set file(v: string | undefined) {
    this.mFile = v;
  }
}

export interface CleartoolIf {
  executable(val?: string | undefined): string;
  credentials(): string[];
}

export class Cleartool implements CleartoolIf {
  private mUsername: string;
  private mPassword: string;
  private mAddress: string;
  private mExecutable: string;

  constructor(u = "", p = "", a = "", e = "") {
    this.mAddress = a;
    this.mPassword = p;
    this.mUsername = u;
    this.mExecutable = "";
    if (e !== "") {
      this.executable(e);
    } else {
      this.executable("cleartool");
    }
  }

  executable(val?: string | undefined): string {
    if (val !== undefined) {
      this.mExecutable = val;
    }
    return this.mExecutable;
  }

  credentials(): string[] {
    if (this.mAddress !== "") {
      return ["-lname", this.mUsername, "-password", this.mPassword, "-server", this.mAddress];
    }
    return [];
  }
}

export class ClearCase {
  private readonly lsView: string[] = ["lsview", "-cview", "-long"];

  private readonly rxViewType = new RegExp("\\.(vws|stg)$", "i");
  private readonly rxViewAttr = new RegExp("(view attributes\\:)([\\,\\t \\w\\d]*)(webview)", "i");

  private mIsCCView = false;
  private mViewType: ViewType = ViewType.unknown;
  private mUpdateEvent = new EventEmitter<Uri>();

  private mUntrackedList = new MappedList();
  private mExecCmd: CleartoolIf;

  private mWebviewPassword = "";

  constructor(
    private configHandler: CCConfigHandler,
    private outputChannel: OutputChannel
  ) {
    if (this.configHandler.configuration.useRemoteClient.value === true) {
      this.mExecCmd = new Cleartool(
        this.configHandler.configuration.webserverUsername.value,
        this.mWebviewPassword,
        this.configHandler.configuration.webserverAddress.value,
        this.configHandler.configuration.executable.value
      );
    } else {
      this.mExecCmd = new Cleartool();
    }
    this.configHandler.onDidChangeConfiguration((datas: string[]) => {
      const hasChangedUseRemote = datas.find((val) => {
        return val === "useRemoteClient";
      });

      const hasChangedExec = datas.find((val) => {
        return val === "cleartoolExecutable";
      });
      if (hasChangedUseRemote !== undefined) {
        window.showWarningMessage(
          "The usewebview config date has changed! Please reload window to set changes active."
        );
      }
      if (hasChangedExec !== undefined) {
        this.mExecCmd.executable(this.configHandler.configuration.executable.value);
      }
    });
  }

  get isView(): boolean {
    return this.mIsCCView;
  }

  get viewType(): ViewType {
    return this.mViewType;
  }

  get onCommandExecuted(): Event<Uri> {
    return this.mUpdateEvent.event;
  }

  get untrackedList(): MappedList {
    return this.mUntrackedList;
  }

  set password(val: string) {
    this.mWebviewPassword = val;
    if (this.configHandler.configuration.useRemoteClient.value === true) {
      this.mExecCmd = new Cleartool(
        this.configHandler.configuration.webserverUsername.value,
        this.mWebviewPassword,
        this.configHandler.configuration.webserverAddress.value,
        this.configHandler.configuration.executable.value
      );
    }
  }

  /**
   * Checks if the file itself is a clearcase object or if it's in a
   * clearcase view
   *
   * @param editor current editor instance
   */
  async checkIsView(editor: TextEditor | undefined): Promise<boolean> {
    let isView = false;
    if (editor?.document !== undefined) {
      try {
        isView = await this.isClearcaseObject(editor.document.uri);
      } catch (error) {
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

  async loginWebview(): Promise<boolean> {
    try {
      const args: CCArgs = new CCArgs(["login"].concat(this.mExecCmd.credentials()));
      const path: string = workspace.workspaceFolders !== undefined ? workspace.workspaceFolders[0].uri.fsPath : "";

      await this.runCleartoolCommand(args, path, (datas) => {
        this.outputChannel.appendLine(datas.join(" "));
        return true;
      });
    } catch (err) {
      this.outputChannel.append(`Error while login ${err}`);
    }
    return false;
  }

  async execOnSCMFile(doc: Uri, func: (arg: Uri) => void): Promise<void> {
    const path = doc.fsPath;

    await this.runCleartoolCommand(
      new CCArgs(["ls"], path),
      dirname(path),
      null,
      () => func(doc),
      (error: string) => {
        this.outputChannel.appendLine(`clearcase, exec error: ${error}`);
        window.showErrorMessage(`${path} is not a valid ClearCase object.`);
      }
    );
  }

  runClearCaseExplorer(doc: Uri): void {
    const path = doc.fsPath;
    exec('clearexplorer "' + path + '"');
  }

  async checkoutFile(doc: Uri): Promise<boolean> {
    const path = doc.fsPath;
    const useClearDlg = this.configHandler.configuration.useClearDlg.value;
    const coArgTmpl = this.configHandler.configuration.checkoutCommand.value;
    const defComment = this.configHandler.configuration.defaultComment.value;

    if (useClearDlg) {
      exec('cleardlg /checkout "' + path + '"', () => this.mUpdateEvent.fire(doc));
      return true;
    } else {
      let comment = "";
      const cmdOpts = coArgTmpl.trim().split(/\s+/);
      let idx = cmdOpts.indexOf("${comment}");
      if (idx > -1) {
        if (defComment) {
          comment = defComment;
        } else {
          comment =
            (await window.showInputBox({
              ignoreFocusOut: true,
              prompt: "Checkout comment",
            })) ?? "";
        }
        cmdOpts[idx] = comment;
      } else {
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
      const cmd: CCArgs = new CCArgs(["co"]);
      cmd.params = cmd.params.concat(cmdOpts);
      idx = cmd.params.indexOf("${filename}");
      if (idx > -1) {
        cmd.params[idx] = this.wslPath(path, false);
      } else {
        cmd.file = path;
      }
      try {
        await this.runCleartoolCommand(cmd, dirname(path), null, () => this.mUpdateEvent.fire(doc));
      } catch (error) {
        this.outputChannel.appendLine("Clearcase error: runCleartoolCommand: " + error);
        return false;
      }
      return true;
    }
  }

  async checkoutAndSaveFile(doc: TextDocument): Promise<void> {
    const path = doc.fileName;
    exec('cleardlg /checkout "' + path + '"', async () => {
      // only trigger save if checkout did work
      // If not and the user canceled this dialog the save event is
      // retriggered because of that save.
      if (this.isReadOnly(doc) === false) {
        try {
          await doc.save();
          this.mUpdateEvent.fire(doc.uri);
        } catch (error) {
          // do nothing.
        }
      } else {
        window.showErrorMessage("Could not save file.");
      }
    });
  }

  async undoCheckoutFile(doc: Uri): Promise<void> {
    const path = doc.fsPath;
    const useClearDlg = this.configHandler.configuration.useClearDlg.value;
    if (useClearDlg) {
      exec('cleardlg /uncheckout "' + path + '"', () => this.mUpdateEvent.fire(doc));
    } else {
      const uncoKeepFile = this.configHandler.configuration.uncoKeepFile.value;
      let rm = "-rm";
      if (uncoKeepFile) {
        rm = "-keep";
      }
      await this.runCleartoolCommand(new CCArgs(["unco", rm], path), dirname(path), null, () =>
        this.mUpdateEvent.fire(doc)
      );
    }
  }

  async createVersionedObject(doc: Uri): Promise<void> {
    const path = doc.fsPath;
    await this.runCleartoolCommand(new CCArgs(["mkelem", "-mkp", "-nc"], path), dirname(path), null, () =>
      this.mUpdateEvent.fire(doc)
    );
  }

  async checkinFile(doc: Uri): Promise<void> {
    const path = doc.fsPath;
    const useClearDlg = this.configHandler.configuration.useClearDlg.value;
    const ciArgTmpl = this.configHandler.configuration.checkinCommand.value;
    const defComment = this.configHandler.configuration.defaultComment.value;

    if (useClearDlg) {
      exec('cleardlg /checkin "' + path + '"', () => this.mUpdateEvent.fire(doc));
    } else {
      let comment = "";
      const cmdOpts = ciArgTmpl.trim().split(/\s+/);
      let idx = cmdOpts.indexOf("${comment}");
      if (idx > -1) {
        if (defComment) {
          comment = defComment;
        } else {
          comment =
            (await window.showInputBox({
              ignoreFocusOut: true,
              prompt: "Checkin comment",
            })) ?? "";
        }
        cmdOpts[idx] = comment;
      } else {
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

      const cmd: CCArgs = new CCArgs(["ci"], path);
      cmd.params = cmd.params.concat(cmdOpts);
      idx = cmd.params.indexOf("${filename}");
      if (idx > -1) {
        cmd.params[idx] = this.wslPath(path, false);
      } else {
        cmd.file = path;
      }

      await this.runCleartoolCommand(cmd, dirname(path), null, () => this.mUpdateEvent.fire(doc));
    }
  }

  async checkinFiles(fileObjs: Uri[], comment: string): Promise<void> {
    for (const fileObj of fileObjs) {
      const cmd: CCArgs = new CCArgs(["ci", "-nc"], fileObj.fsPath);
      if (comment !== "") {
        cmd.params = ["ci", "-c", comment];
      }
      if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
        await this.runCleartoolCommand(cmd, workspace.workspaceFolders[0].uri.fsPath, (data: string[]) => {
          this.outputChannel.appendLine(`ClearCase checkin: ${data[0]}`);
        });
      }
    }
  }

  versionTree(doc: Uri): void {
    const path = doc.fsPath;
    this.runCleartoolCommand(new CCArgs(["lsvtree", "-graphical"], path), dirname(path), null);
  }

  diffWithPrevious(doc: Uri): void {
    const path = doc.fsPath;
    this.runCleartoolCommand(new CCArgs(["diff", "-graph", "-pred"], path), dirname(path), null);
  }

  /**
   * Searching checkout files in all vobs of the current view
   */
  async findCheckouts(): Promise<string[]> {
    const lscoArgTmpl = this.configHandler.configuration.findCheckoutsCommand.value;
    let resNew: string[] = [];
    let wsf = "";
    if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
      wsf = workspace.workspaceFolders[0].uri.fsPath;
    }
    try {
      const runInWsl = this.isRunningInWsl();
      const cmdOpts = lscoArgTmpl.split(" ");
      const cmd: CCArgs = new CCArgs(["lsco", ...cmdOpts]);
      await this.runCleartoolCommand(cmd, wsf, null, (result: string) => {
        if (result.length > 0) {
          const results: string[] = result.trim().split(/\r\n|\r|\n/);
          resNew = results.map((e) => {
            if (e.startsWith("\\") && type() === "Windows_NT") {
              e = e.replace("\\", wsf.toUpperCase()[0] + ":\\");
            }
            if (runInWsl === true) {
              // e = this.wslPath(e, true, runInWsl);
              e = e.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (s: string, g1: string) => `/mnt/${g1.toLowerCase()}`);
            }
            return e;
          });
        }
      });
    } catch (error) {
      this.outputChannel.appendLine(getErrorMessage(error));
    }
    return resNew;
  }

  /**
   * Searching view private objects in all workspace folders of the current project.
   * The result is filtered by the configuration 'ViewPrivateFileSuffixes'
   */
  async findUntracked(pathObj: Uri | undefined): Promise<void> {
    try {
      if (pathObj === undefined) {
        return;
      }
      const cmd: CCArgs = new CCArgs(["ls", "-view_only", "-short", "-r"]);
      await this.runCleartoolCommand(cmd, pathObj.fsPath, (data: string[]) => {
        data.forEach((val) => {
          let f = val;
          if (val.match(/@@/g) !== null) {
            const p = val.split("@@");
            if (p[1].match(/checkedout/gi) === null) {
              f = p[0];
            } else {
              f = "";
            }
          }
          if (f !== "") {
            const p = join(pathObj.fsPath, f);
            this.untrackedList.addStringByKey(p, pathObj.fsPath);
          }
        });
      });
    } catch (error) {
      this.outputChannel.appendLine(getErrorMessage(error));
    }
  }

  findCheckoutsGui(path: string): void {
    exec('clearfindco "' + path + '"');
  }

  findModified(path: string): void {
    exec('clearviewupdate -pname "' + path + '" -modified');
  }

  updateView(): void {
    exec("clearviewupdate");
  }

  /**
   * Alternate methode detecting if the given path is part of an clearcase
   * view.
   */
  async hasConfigspec(): Promise<boolean> {
    let result = false;
    try {
      if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
        const cmd: CCArgs = new CCArgs(["catcs"]);
        await this.runCleartoolCommand(
          cmd,
          workspace.workspaceFolders[0].uri.fsPath,
          null,
          (finishRes: string) => {
            if (finishRes === "error") {
              result = false;
            } else {
              result = true;
            }
          },
          (errorRes: string) => {
            if (errorRes.length > 0) {
              result = false;
            }
          }
        );
      }
    } catch (error) {
      result = false;
    }
    return result;
  }

  /**
   * Returns whether the given file object a clearcase object.
   *
   * @param iUri the uri of the file object to be checked
   */
  async isClearcaseObject(iUri: Uri): Promise<boolean> {
    try {
      return "" !== (await this.getVersionInformation(iUri));
    } catch (error) {
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
  async getVersionInformation(iUri: Uri, normalize = true): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (iUri === undefined || workspace.workspaceFolders === undefined) {
        reject("");
      } else {
        let fileVers = "";
        this.runCleartoolCommand(
          new CCArgs(["ls", "-d", "-short"], iUri.fsPath),
          workspace.workspaceFolders[0].uri.fsPath,
          null,
          (result: string) => (fileVers = this.getVersionString(result, normalize)),
          (error: string) => {
            this.outputChannel.appendLine(`clearcase, exec error: ${error}`);
            fileVers = "?";
          }
        ).then(() => resolve(fileVers));
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
  getVersionString(iFileInfo: string, normalize: boolean): string {
    if (iFileInfo !== undefined && iFileInfo !== null && iFileInfo !== "") {
      const res = iFileInfo.split("@@");
      if (res.length > 1) {
        return normalize ? res[1].replace(/\\/g, "/").trim() : res[1].trim();
      }
    }
    return "";
  }

  async updateDir(uri: Uri): Promise<void> {
    try {
      const msg: string | undefined = await this.updateObject(uri, 0);
      window.showInformationMessage(`Update of ${msg} finished!`);
    } catch (error) {
      window.showErrorMessage(getErrorMessage(error));
    }
  }

  async updateFile(uri: Uri): Promise<void> {
    try {
      const msg: string | undefined = await this.updateObject(uri, 1);
      window.showInformationMessage(`Update of ${msg} finished!`);
    } catch (error) {
      window.showErrorMessage(getErrorMessage(error));
    }
  }

  /**
   * @param filePath Uri of the selected file object in the explorer
   * @param updateType which one to update: 0=directory, 1=file
   */
  async updateObject(filePath: Uri, updateType: number): Promise<string | undefined> {
    let resultOut = "";

    if (window.activeTextEditor !== undefined) {
      const p =
        filePath === null || filePath === undefined || filePath.fsPath === null
          ? window.activeTextEditor.document.fileName
          : filePath.fsPath;

      const stat = fs.lstatSync(p);
      let updateFsObj = "";
      let cwd = "";

      if (stat.isDirectory()) {
        updateFsObj = p;
        cwd = p;
      } else if (stat.isFile()) {
        cwd = updateFsObj = dirname(p);
        if (updateType === 1) {
          updateFsObj = p;
        }
      }

      let errorRes = "";
      await this.runCleartoolCommand(
        new CCArgs(["update"], updateFsObj),
        cwd,
        () => this.mUpdateEvent.fire(filePath),
        (result: string) => (resultOut = result),
        (error: string) => (errorRes = error)
      );
      if (errorRes.length > 0) {
        throw new Error(errorRes);
      }
    }

    return resultOut;
  }

  itemProperties(doc: Uri): void {
    const path = doc.fsPath;
    exec('cleardescribe "' + path + '"');
  }

  async annotate(fileUri: Uri, ctrl: CCAnnotationController): Promise<void> {
    try {
      const content = await this.getAnnotatedFileContent(fileUri.fsPath);
      ctrl.setAnnotationInText(content);
    } catch (error) {
      const message = getErrorMessage(error).replace(/[\r\n]+/g, " ");
      window.showErrorMessage(message);
    }
  }

  private async getAnnotatedFileContent(filePath: string): Promise<string> {
    let resultOut = "";
    if (workspace.workspaceFolders !== undefined) {
      let errorRes = "";
      const fmt = this.configHandler.configuration.annotationFormatString.value;
      const sep = " | ";
      const fileP = this.wslPath(filePath, false);

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
      if (errorRes.length > 0) {
        throw new Error(errorRes);
      }
    }
    return resultOut;
  }

  // returns true if the given document is read-only
  isReadOnly(doc: TextDocument): boolean {
    const filePath = doc.fileName;
    try {
      fs.accessSync(filePath, fs.constants.W_OK);
      return false;
    } catch (error) {
      return true;
    }
  }

  private async getCurrentActivity(): Promise<string> {
    let resultOut = "";
    if (workspace.workspaceFolders !== undefined) {
      let errorRes = "";
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
      if (errorRes.length > 0) {
        throw new Error(errorRes);
      }
    }
    return resultOut;
  }

  // return view activities as QuickPickItem list
  private async getQuickPickActivities(currentAcvtId: string): Promise<QuickPickItem[]> {
    const resultOut: QuickPickItem[] = [];
    if (workspace.workspaceFolders !== undefined) {
      let errorRes = "";
      await this.runCleartoolCommand(
        new CCArgs(["lsactivity"]),
        workspace.workspaceFolders[0].uri.fsPath,
        null,
        (result: string) => {
          const lines = result.split(/[\n\r]+/);
          for (const line of lines) {
            const parts = line.split(" ");
            if (parts.length >= 7) {
              const actvId = parts[2];
              let actvLb = parts.slice(7).join(" ");

              if (actvId === currentAcvtId) {
                actvLb = "\u2713 " + actvLb;
              } else {
                actvLb = "\u2610 " + actvLb;
              }

              resultOut.push({
                label: actvLb,
                description: "",
                detail: actvId,
              });
            }
          }
        },
        (error: string) => {
          errorRes = error;
        }
      );
      if (errorRes.length > 0) {
        throw new Error(errorRes);
      }
    }
    return resultOut;
  }

  async changeCurrentActivity(): Promise<void> {
    try {
      const currentActv = await this.getCurrentActivity();
      const userChoose = await window.showQuickPick<QuickPickItem>(this.getQuickPickActivities(currentActv));

      if (userChoose) {
        if (currentActv === userChoose.detail) {
          this.setViewActivity(undefined);
        } else {
          this.setViewActivity(userChoose.detail);
        }
      }
    } catch (error) {
      const message = getErrorMessage(error).replace(/[\r\n]+/g, " ");
      window.showErrorMessage(message);
    }
  }

  private async setViewActivity(actvID: string | undefined): Promise<string> {
    let resultOut = "";
    if (workspace.workspaceFolders !== undefined) {
      let errorRes = "";
      let id = "-none";
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
      if (errorRes.length > 0) {
        throw new Error(errorRes);
      }
    }
    return resultOut;
  }

  async readFileAtVersion(fsPath: string, version: string): Promise<string> {
    // cannot call getFileAtVersion because the temp file is automatically removed
    let tempDir = this.configHandler.configuration.tempDir.value;
    let tempFile = "";
    let ret = undefined;
    const isWsl = this.isRunningInWsl();
    if (isWsl === true) {
      tempDir = this.wslPath(tempDir, true, isWsl);
      tempFile = tmp.tmpNameSync({ tmpdir: tempDir });
      ret = Uri.file(tempFile);
      tempFile = this.wslPath(tempFile, false, isWsl);
    } else {
      tempFile = tmp.tmpNameSync({ tmpdir: tempDir });
      ret = Uri.file(tempFile);
    }
    if (workspace.workspaceFolders !== undefined) {
      await this.runCleartoolCommand(
        new CCArgs(["get", "-to", tempFile], fsPath, version),
        workspace.workspaceFolders[0].uri.fsPath,
        null,
        (result: string) => {
          console.log(result);
        },
        (error: string) => {
          console.error(error);
        }
      );
    }
    return fs.readFileSync(ret.fsPath, { encoding: "utf-8" });
  }

  private runCleartoolCommand(
    cmd: CCArgs,
    cwd: string,
    onData: ((data: string[]) => void) | null,
    onFinished?: (result: string) => void,
    onError?: (result: string) => void
  ): Promise<void> {
    const executable: string = this.mExecCmd.executable();
    try {
      fs.accessSync(cwd, fs.constants.F_OK);
    } catch (err) {
      this.outputChannel.appendLine(`CWD (${cwd}) not found`);
      return Promise.reject();
    }
    // convert path to run cleartool windows cmd
    if (cmd.file) {
      // wsl mount point for external drives is /mnt
      // convert backslash to slash
      cmd.file = this.wslPath(cmd.file, false);
    }
    if (cmd.file !== undefined && !fs.existsSync(cmd.file)) {
      return Promise.reject();
    }

    const outputChannel = this.outputChannel;
    const isView = this.isView;

    return new Promise<void>((resolve, reject) => {
      let cmdErrMsg = "";

      outputChannel.appendLine(cmd.getCmd().toString());
      let allData: Buffer = Buffer.alloc(0);
      let allDataStr = "";
      const command = spawn(executable, cmd.getCmd(), { cwd: cwd, env: process.env });

      command.stdout.on("data", (data) => {
        let res = "";
        if (typeof data === "string") {
          res = data;
          allDataStr += data;
        } else {
          allData = Buffer.concat([allData, data], allData.length + data.length);
          res = JSON.stringify(data);
        }
        if (onData !== null && typeof onData === "function") {
          onData(res.split(/\r\n|\r|\n/).filter((s: string) => s.length > 0));
        }
      });

      command.stderr.on("data", (data) => {
        let msg: string;
        if (typeof data === "string") {
          msg = data;
        } else {
          msg = JSON.stringify(data);
        }
        if (onError !== undefined && typeof onError === "function") {
          onError(msg);
        } else {
          cmdErrMsg = `${cmdErrMsg}${msg}`;
        }
      });

      command.on("close", (code) => {
        if (code !== 0) {
          outputChannel.appendLine(cmdErrMsg);
          if (isView && cmdErrMsg !== "") {
            window.showErrorMessage(`${cmdErrMsg}`, { modal: false });
          }
          if (typeof onFinished === "function") {
            onFinished("error");
          }
        } else {
          if (typeof onFinished === "function") {
            onFinished(allData.length > 0 ? allData.toString() : allDataStr);
          }
        }
        resolve();
      });

      command.on("error", (error) => {
        const msg = `Cleartool error: Cleartool command error: ${error.message}`;
        outputChannel.appendLine(msg);
        reject(error.message);
      });
    });
  }

  private async detectViewType(): Promise<ViewType> {
    let lines: string[] = [];
    let viewType: ViewType = ViewType.unknown;

    const filterGlobalPathLines = (l: string) => {
      if (l.length === 0) {
        return false;
      }
      const ma: RegExpMatchArray | null = l.match(this.rxViewType);
      return !!ma && ma.length > 0;
    };
    if (workspace.workspaceFolders !== undefined) {
      await this.runCleartoolCommand(
        new CCArgs(this.lsView),
        workspace.workspaceFolders[0].uri.fsPath,
        null,
        (result: string) => {
          lines = result.split(/\r\n|\r|\n/).filter((s) => s.length > 0);
          const resLines: string[] = lines.filter(filterGlobalPathLines);
          if (resLines.length === 0) {
            return;
          }
          if (resLines[0].endsWith(".vws")) {
            viewType = ViewType.dynamic;
          } else {
            viewType = ViewType.snapshot;
            if (resLines.length > 1 && resLines[1].match(/webview/i)) {
              viewType = ViewType.webview;
            }
          }
        }
      );
    }
    return viewType;
  }

  private isRunningInWsl(): boolean {
    return this.configHandler.configuration.isWslEnv.value;

    if (type() !== "Windows_NT") {
      // check if wslpath executeable is available
      try {
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
  async runClearTooledcs(baseFolder: string): Promise<ChildProcess> {
    const executable = this.configHandler.configuration.executable.value;
    process.env["VISUAL"] = "code -r";
    const options = {
      cwd: baseFolder,
      env: process.env,
    };
    return new Promise<ChildProcess>((resolve, reject) => {
      const child: ChildProcess = exec(`${executable} edcs`, options, (error, stdout, stderr) => {
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

  private wslPath(path: string, toLinux = true, runInWsl?: boolean): string {
    if (runInWsl === undefined) {
      runInWsl = this.isRunningInWsl();
    }
    if (runInWsl === true) {
      if (toLinux === true) {
        return path.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (s: string, g1: string) => `/mnt/${g1.toLowerCase()}`);
      } else {
        return path.replace(/^\/mnt\/([A-Za-z])/, `$1:`).replace(/\//g, "\\");
      }
    }
    return path;
  }
}

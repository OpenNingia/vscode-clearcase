import { exec, ChildProcess, spawnSync } from "child_process";
import * as fs from "fs";
import { type } from "os";
import { dirname, join } from "path";

import * as tmp from "tmp";
import {
  Event,
  EventEmitter,
  MessageItem,
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
  private mFiles: string[] = [];
  private mVersion: string | undefined;

  constructor(params: string[], file?: string[], version?: string) {
    this.params = [...params];
    if (file) {
      this.mFiles = [...file];
    }
    this.mVersion = version;
  }

  private toString(): string {
    return this.params.reduce((a: string, s: string) => `${a} ${s}`) + ` ${this.mFiles}`;
  }

  getCmd(): string[] {
    if (this.mFiles !== undefined && this.mVersion === undefined) {
      return [...this.params, ...this.mFiles];
    } else if (this.mFiles !== undefined && this.mVersion !== undefined && this.mVersion !== "") {
      return [...this.params, `${this.mFiles[0]}@@${this.mVersion}`];
    }
    return this.params;
  }

  get files(): string[] {
    return this.mFiles;
  }

  set files(v: string[]) {
    this.mFiles = [...v];
  }

  set file(v: string) {
    this.mFiles.push(v);
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
  private readonly rxViewAttr = new RegExp("(view attributes\\:)\\s*(snapshot)", "i");

  private mIsCCView = false;
  private mIsWslEnv = false;
  private mViewType: ViewType = ViewType.unknown;
  private mUpdateEvent = new EventEmitter<Uri[]>();

  private mUntrackedList = new MappedList();
  private mExecCmd: CleartoolIf;

  private mWebviewPassword = "";

  constructor(private configHandler: CCConfigHandler, private outputChannel: OutputChannel) {
    if (this.configHandler.configuration.useRemoteClient.value === true) {
      this.mExecCmd = new Cleartool(
        this.configHandler.configuration.webserverUsername.value,
        this.mWebviewPassword,
        this.configHandler.configuration.webserverAddress.value,
        this.configHandler.configuration.executable.value
      );
    } else {
      this.mExecCmd = new Cleartool("", "", "", this.configHandler.configuration.executable.value);
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

  get onCommandExecuted(): Event<Uri[]> {
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

  async detectIsWsl(): Promise<boolean> {
    this.mIsWslEnv = false;
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
    this.mIsWslEnv = true;
    return true;
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

  async execOnSCMFile(docs: Uri[], func: (arg: Uri[]) => void): Promise<void> {
    await this.runCleartoolCommand(
      new CCArgs(["ls"], [docs[0]?.fsPath]),
      dirname(docs[0]?.fsPath),
      null,
      (code: number, _output: string, error: string) => {
        if (code !== 0 || error.length > 0) {
          window.showErrorMessage(`${docs[0]?.fsPath} is not a valid ClearCase object.`);
        } else {
          func(docs);
        }
      }
    );
  }

  runClearCaseExplorer(docs: Uri[]): void {
    exec('clearexplorer "' + docs[0]?.fsPath + '"');
  }


  async checkoutFileAction(docs: Uri[]): Promise<boolean> {
    const useClearDlg = this.configHandler.configuration.useClearDlg.value;
    if (useClearDlg) {
      for (const doc of docs) {
        if (type() === "Windows_NT") {
          exec(`cleardlg /checkout ${doc.fsPath}`, () => this.mUpdateEvent.fire([doc]));
          return true;
        } else {
          const userActions: MessageItem[] = [{ title: "Yes" }, { title: "No" }];
          const userAction = await window.showInformationMessage(`Do you want to checkout the current file?`, ...userActions);
          switch (userAction?.title) {
            case userActions[0].title: {
              return await this.checkoutFile([doc]);
            }
            case userActions[1].title: {
              break;
            }
          }
        }
      }
      return true;
    } else {
      return await this.checkoutFile(docs);
    }
  }

  async checkoutFile(docs: Uri[]): Promise<boolean> {
    const coArgTmpl = this.configHandler.configuration.checkoutCommand.value;
    const defComment = this.configHandler.configuration.defaultComment.value;

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
      if (docs.length === 1) {
        cmd.params[idx] = this.wslPath(docs[0]?.fsPath, false);
      } else {
        cmd.params[idx] = "";
      }
    }
    if (docs.length > 1 || idx === -1) {
      cmd.files = docs.map((d: Uri) => {
        return this.wslPath(d.fsPath, false);
      });
    }

    try {
      await this.runCleartoolCommand(cmd, dirname(docs[0]?.fsPath), null, () => this.mUpdateEvent.fire(docs));
    } catch (error) {
      this.outputChannel.appendLine("Clearcase error: runCleartoolCommand: " + getErrorMessage(error));
      return false;
    }
    return true;
  }

  async checkoutAndSaveFile(doc: TextDocument): Promise<void> {
    const path = doc.fileName;
    if (type() === "Windows_NT") {
      exec('cleardlg /checkout "' + path + '"', async () => {
        // only trigger save if checkout did work
        // If not and the user canceled this dialog the save event is
        // retriggered because of that save.
        if (this.isReadOnly(doc) === false) {
          try {
            await doc.save();
            this.mUpdateEvent.fire([doc.uri]);
          } catch (error) {
            // do nothing.
          }
        } else {
          window.showErrorMessage("Could not save file.");
        }
      });
    } else {
      const userActions: MessageItem[] = [{ title: "Yes" }, { title: "No" }];
      const userAction = await window.showInformationMessage(`Do you want to checkout the current file?`, ...userActions);
      switch (userAction?.title) {
        case userActions[0].title: {
          await this.checkoutFile([doc.uri]);
          await doc.save();
          break;
        }
        case userActions[1].title: {
          break;
        }
      }
    }
  }

  async undoCheckoutFileAction(docs: Uri[]): Promise<void> {
    const useClearDlg = this.configHandler.configuration.useClearDlg.value;
    if (useClearDlg) {
      for (const doc of docs) {
        if (type() === "Windows_NT") {
          exec(`cleardlg /uncheckout ${doc.fsPath}`, () => this.mUpdateEvent.fire([doc]));
        } else {
          const userActions: MessageItem[] = [{ title: "Yes" }, { title: "No" }];
          const userAction = await window.showInformationMessage(`Do you want to undo checkout the current file?`, ...userActions);
          switch (userAction?.title) {
            case userActions[0].title: {
              await this.undoCheckoutFile([doc]);
              break;
            }
            case userActions[1].title: {
              break;
            }
          }
        }
      }
    } else {
      await this.undoCheckoutFile(docs);
    }
  }

  async undoCheckoutFile(docs: Uri[]): Promise<void> {
    const uncoKeepFile = this.configHandler.configuration.uncoKeepFile.value;
    let rm = "-rm";
    if (uncoKeepFile) {
      rm = "-keep";
    }
    const files = docs.map((d: Uri) => {
      return this.wslPath(d.fsPath, false);
    });

    await this.runCleartoolCommand(new CCArgs(["unco", rm], files), dirname(docs[0]?.fsPath), null, () =>
      this.mUpdateEvent.fire(docs)
    );
  }

  async createVersionedObject(docs: Uri[]): Promise<void> {
    const files = docs.map((d: Uri) => {
      return this.wslPath(d.fsPath, false);
    });

    await this.runCleartoolCommand(new CCArgs(["mkelem", "-mkp", "-nc"], files), dirname(docs[0]?.fsPath), null, () => this.mUpdateEvent.fire(docs));
  }

  async checkinFileAction(docs: Uri[]): Promise<void> {
    const useClearDlg = this.configHandler.configuration.useClearDlg.value;
    if (useClearDlg) {
      for (const doc of docs) {
        if (type() === "Windows_NT") {
          exec(`cleardlg /checkin ${doc.fsPath}`, () => this.mUpdateEvent.fire([doc]));
        } else {
          const userActions: MessageItem[] = [{ title: "Yes" }, { title: "No" }];
          const userAction = await window.showInformationMessage(`Do you want to checkin the current file?`, ...userActions);
          switch (userAction?.title) {
            case userActions[0].title: {
              await this.checkinFile([doc]);
              break;
            }
            case userActions[1].title: {
              break;
            }
          }
        }
      }
    } else {
      await this.checkinFile(docs);
    }
  }

  async checkinFile(docs: Uri[]): Promise<void> {
    const ciArgTmpl = this.configHandler.configuration.checkinCommand.value;
    const defComment = this.configHandler.configuration.defaultComment.value;

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

    const cmd: CCArgs = new CCArgs(["ci"]);
    cmd.params = cmd.params.concat(cmdOpts);
    idx = cmd.params.indexOf("${filename}");
    if (idx > -1) {
      if (docs.length === 1) {
        cmd.params[idx] = this.wslPath(docs[0]?.fsPath, false);
      } else {
        cmd.params[idx] = "";
      }
    }
    if (docs.length > 1 || idx === -1) {
      cmd.files = docs.map((d: Uri) => {
        return this.wslPath(d.fsPath, false);
      });
    }

    await this.runCleartoolCommand(cmd, dirname(docs[0]?.fsPath), null, () => this.mUpdateEvent.fire(docs));
  }

  async checkinFiles(docs: Uri[], comment: string): Promise<void> {
    const cmd: CCArgs = new CCArgs(["ci"]);
    if (comment !== "") {
      cmd.params.push("-c");
      cmd.params.push(comment);
    } else {
      cmd.params.push("-nc");
    }
    cmd.files = docs.map((d: Uri) => {
      return this.wslPath(d.fsPath, false);
    });
    if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
      await this.runCleartoolCommand(cmd, workspace.workspaceFolders[0].uri.fsPath, (data: string[]) => {
        this.outputChannel.appendLine(`ClearCase checkin: ${data[0]}`);
      });
    }
  }

  versionTree(docs: Uri[]): void {
    for (const doc of docs) {
      this.runCleartoolCommand(new CCArgs(["lsvtree", "-graphical"], [doc.fsPath]), dirname(doc.fsPath), null);
    }
  }

  diffWithPrevious(docs: Uri[]): void {
    for (const doc of docs) {
      this.runCleartoolCommand(new CCArgs(["diff", "-graph", "-pred"], [doc.fsPath]), dirname(doc.fsPath), null);
    }
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
      await this.runCleartoolCommand(
        cmd,
        wsf,
        null,
        (_code: number, output: string, _error: string) => {
          if (output.length > 0) {
            const results: string[] = output.trim().split(/\r\n|\r|\n/);
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
        }
      );
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
    if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
      try {
        for (const p of workspace.workspaceFolders) {
          const cmd: CCArgs = new CCArgs(["catcs"]);
          await this.runCleartoolCommand(
            cmd,
            p.uri.fsPath,
            null,
            (code: number, _output: string, error: string) => {
              //  Success only if command exit code is 0 and nothing on stderr
              result = (code === 0 && error.length === 0);
            }
          );
          if (result !== false) {
            break;
          }
        }
      } catch (error) {
        result = false;
      }
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
    if (iUri !== undefined && this.isView === true) {
      let fileVers = "";
      const cwd = dirname(iUri.fsPath);
      await this.runCleartoolCommand(
        new CCArgs(["describe", "-fmt", `"%m||%Vn"`], [iUri.fsPath]),
        cwd,
        null,
        (code: number, output: string, error: string) => {
          fileVers = (code === 0 && error.length === 0) ?
            this.getVersionString(output, normalize) : "?";
        }
      );
      return fileVers;
    }
    return "";
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
      const res = iFileInfo.replace(/"/g, '').split("||");
      if (res.length > 1 && res[0] === "version") {
        return normalize ? res[1].replace(/\\/g, "/").trim() : res[1].trim();
      } else if (res[0].includes("private")) {
        return res[0];
      } else {
        return "not in a VOB";
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
        new CCArgs(["update"], [updateFsObj]),
        cwd,
        () => this.mUpdateEvent.fire([filePath]),
        (_code: number, output: string, error: string) => {
          errorRes = error;
          resultOut = output;
        }
      );
      if (errorRes.length > 0) {
        throw new Error(errorRes);
      }
    }

    return resultOut;
  }

  itemProperties(docs: Uri[]): void {
    for (const doc of docs) {
      exec(`cleardescribe ${doc.fsPath}`);
    }
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
        (_code: number, output: string, error: string) => {
          errorRes = error;
          resultOut = output;
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
        (_code: number, output: string, error: string) => {
          errorRes = error;
          resultOut = output;
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
        (_code: number, output: string, error: string) => {
          errorRes = error;
          const lines = output.split(/[\n\r]+/);
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
        (_code: number, output: string, error: string) => {
          errorRes = error;
          resultOut = output;
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
    if (this.isRunningInWsl() === true) {
      tempDir = this.wslPath(tempDir, true);
      tempFile = tmp.tmpNameSync({ tmpdir: tempDir });
      ret = Uri.file(tempFile);
      tempFile = this.wslPath(tempFile, false);
    } else {
      tempFile = tmp.tmpNameSync({ tmpdir: tempDir });
      ret = Uri.file(tempFile);
    }
    if (workspace.workspaceFolders !== undefined) {
      await this.runCleartoolCommand(
        new CCArgs(["get", "-to", tempFile], [fsPath], version),
        workspace.workspaceFolders[0].uri.fsPath,
        null,
        (_code: number, output: string, _error: string) => {
          //  Only log stdout contents here; stderr is logged by runCleartoolCommand if non-empty
          console.log(output);
        }
      );
    }
    const enc = this.configHandler.configuration.diffViewEncoding.value !== "" ?
      this.configHandler.configuration.diffViewEncoding.value :
      "utf8";
    return fs.readFileSync(ret.fsPath, { encoding: enc });
  }

  private async runCleartoolCommand(
    cmd: CCArgs,
    cwd: string,
    onData: ((data: string[]) => void) | null,
    onFinished?: (code: number, output: string, error: string) => void
  ): Promise<void> {
    const executable: string = this.mExecCmd.executable();
    try {
      fs.accessSync(cwd, fs.constants.F_OK);
    } catch (err) {
      this.outputChannel.appendLine(`CWD (${cwd}) not found`);
      return Promise.reject();
    }
    // convert path to run cleartool windows cmd
    // wsl mount point for external drives is /mnt
    // convert backslash to slash
    cmd.files = cmd.files.map((f) => this.wslPath(f, false));

    const outputChannel = this.outputChannel;

    outputChannel.appendLine(cmd.getCmd().toString());
    const command = spawnSync(executable, cmd.getCmd(), { cwd: cwd, env: process.env });

    if (command.stderr.length > 0) {
      let msg = command.stderr;
      if (Buffer.isBuffer(msg)) {
        msg = msg.toString();
      }
      window.showErrorMessage(`${msg}`, { modal: false });
      return Promise.reject(msg);
    } else if (command.stdout.length > 0) {
      if (typeof onFinished === "function") {
        let msg = command.stdout;
        if (Buffer.isBuffer(msg)) {
          msg = msg.toString();
        }
        let msgErr = command.stderr;
        if (Buffer.isBuffer(msgErr)) {
          msgErr = msgErr.toString();
        }
        onFinished(Number(command.signal), msg, msgErr);
      }
      return Promise.resolve();
    }
  }

  private async detectViewType(): Promise<ViewType> {
    let lines: string[] = [];
    let viewType: ViewType = ViewType.unknown;

    const filterGlobalPathLines = (l: string) => {
      if (l.length === 0) {
        return false;
      }
      return (l.match(/view uuid: ([\w.:]+)/gi) ??
        l.match(/view attributes:\s+snapshot/gi));
    };
    if (workspace.workspaceFolders !== undefined) {
      await this.runCleartoolCommand(
        new CCArgs(this.lsView),
        workspace.workspaceFolders[0].uri.fsPath,
        null,
        (_code: number, output: string, _error: string) => {
          lines = output.split(/\r\n|\r|\n/).filter((s) => s.length > 0);
          const resLines: string[] = lines.filter(filterGlobalPathLines);
          if (resLines.length === 0) {
            return;
          }
          if (resLines.length > 1 && resLines[1].match(/View attributes: snapshot/)) {
            viewType = ViewType.snapshot;
            if (resLines.length > 1 && resLines[1].match(/webview/i)) {
              viewType = ViewType.webview;
            }
          } else {
            viewType = ViewType.dynamic;
          }
        }
      );
    }
    return viewType;
  }

  public isRunningInWsl(): boolean {
    return this.mIsWslEnv;
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

  public wslPath(path: string, toLinux = true): string {
    const newPath = this.getMappedPath(path, toLinux);
    if (this.isRunningInWsl()) {
      if (toLinux === true) {
        return newPath.replace(/\\/g, "/");
      } else {
        return newPath.replace(/\//g, "\\");
      }
    }
    return path;
  }

  public getMappedPath(path: string, toLinux: boolean): string {
    if (this.isRunningInWsl()) {
      if (this.configHandler.configuration.pathMapping.value.length > 0) {
        for (const p of this.configHandler.configuration.pathMapping.value) {
          if (toLinux === false) {
            if (path.startsWith(p.wsl)) {
              return path.replace(p.wsl, p.host);
            }
          } else {
            if (path.startsWith(p.host)) {
              return path.replace(p.host, p.wsl);
            }
          }
        }
      } else {
        if (toLinux === true) {
          return path.replace(/^([A-Za-z]):/, (s: string, g1: string) => `/mnt/${g1.toLowerCase()}`);
        } else {
          return path.replace(/^\/mnt\/([A-Za-z])/, `$1:`);
        }
      }
    }
    return path;
  }

  /**
   * check if the file is within the current workspace
   * avoid error messages related to files edited outside the current workspace
   */
  private checkIfInWorkspace(file: string): boolean {
    let ret = false;
    if (workspace.workspaceFolders && file !== "") {
      for (const wsPath of workspace.workspaceFolders) {
        try {
          fs.accessSync(wsPath.uri.fsPath, fs.constants.F_OK);
          ret = file.includes(wsPath.uri.fsPath);
          if (ret === true) {
            break;
          }
        } catch (e) {
          ret = false;
        }
      }
    }
    return ret;
  }
}

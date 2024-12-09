import { exec, ChildProcess, spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as fs from "fs";
import { type } from "os";
import { dirname } from "path";

import * as tmp from "tmp";
import {
  Event,
  EventEmitter,
  MessageItem,
  QuickPickItem,
  TextDocument,
  TextEditor,
  Uri,
  window,
  workspace,
} from "vscode";
import { getErrorMessage } from "../ui/errormessage";
import { CCVersionState, VersionType } from "./verstion-type";
import UiControl from "../ui/ui-control";
import CcOutputChannel, { LogLevel } from "../ui/output-channel";
import CmdArgs from "./cmd-args";
import { ViewType } from "./view-type";
import { ClearcaseCleartoolIf } from "./clearcase-cleartool-if";
import { ClearcaseCleartool } from "./clearcase-cleartool";
import { AnnotationController } from "../annotation/annotation-controller";
import { ConfigurationHandler } from "../configuration/configuration-handler";

export enum EventActions {
  Add = 0,
  Remove = 1,
}

export class EventArgs {
  fileObject: Uri | undefined;
  action: EventActions | undefined;
}

export class Clearcase {
  private readonly lsView: string[] = ["lsview", "-cview", "-long"];

  private readonly rxViewType = new RegExp("\\.(vws|stg)$", "i");
  private readonly rxViewAttr = new RegExp("(view attributes\\:)\\s*(snapshot)", "i");

  private mIsCCView = false;
  private mIsWslEnv = false;
  private mViewType: ViewType = ViewType.Unknown;
  private mUpdateEvent = new EventEmitter<Uri[]>();

  private mExecCmd: ClearcaseCleartoolIf;

  private mWebviewPassword = "";

  private mRunningCommands = new Map<string, ChildProcessWithoutNullStreams>();

  constructor(protected configHandler: ConfigurationHandler, protected outputChannel: CcOutputChannel) {
    if (this.configHandler.configuration.useRemoteClient.value === true) {
      this.mExecCmd = new ClearcaseCleartool(
        this.configHandler.configuration.webserverUsername.value,
        this.mWebviewPassword,
        this.configHandler.configuration.webserverAddress.value,
        this.configHandler.configuration.executable.value
      );
    } else {
      this.mExecCmd = new ClearcaseCleartool("", "", "", this.configHandler.configuration.executable.value);
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

  set password(val: string) {
    this.mWebviewPassword = val;
    if (this.configHandler.configuration.useRemoteClient.value === true) {
      this.mExecCmd = new ClearcaseCleartool(
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
      } catch {
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
      const args: CmdArgs = new CmdArgs(["login"].concat(this.mExecCmd.credentials()));
      const path: string = workspace.workspaceFolders !== undefined ? workspace.workspaceFolders[0].uri.fsPath : "";

      await this.runCleartoolCommand("loginWebview", args, path, (datas) => {
        this.outputChannel.appendLine(datas.join(" "), LogLevel.Information);
        return true;
      });
    } catch (err) {
      this.outputChannel.append(`Error while login ${err}`, LogLevel.Error);
    }
    return false;
  }

  async execOnSCMFile(docs: Uri[], func: (arg: Uri[]) => void): Promise<void> {
    await this.runCleartoolCommand(
      "execOnScmFile",
      new CmdArgs(["ls"], [docs[0]?.fsPath]),
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
          const userAction = await window.showInformationMessage(
            `Do you want to checkout the current file?`,
            ...userActions
          );
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
    // by default add the usehijack flag to also checkout hijacked files
    if (!coArgTmpl.includes("usehijack") && this.viewType === ViewType.Snapshot) {
      cmdOpts.splice(0, 0, "-usehijack");
    }
    const cmd: CmdArgs = new CmdArgs(["co"]);
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
      await this.runCleartoolCommand("checkoutFile", cmd, dirname(docs[0]?.fsPath), null, () =>
        this.mUpdateEvent.fire(docs)
      );
    } catch (error) {
      this.outputChannel.appendLine("Clearcase error: runCleartoolCommand: " + getErrorMessage(error), LogLevel.Error);
      window.showErrorMessage(`${getErrorMessage(error)}`, { modal: false });
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
          } catch {
            // do nothing.
          }
        } else {
          window.showErrorMessage("Could not save file.");
        }
      });
    } else {
      const userActions: MessageItem[] = [{ title: "Yes" }, { title: "No" }];
      const userAction = await window.showInformationMessage(
        `Do you want to checkout the current file?`,
        ...userActions
      );
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
          const userAction = await window.showInformationMessage(
            `Do you want to undo checkout the current file?`,
            ...userActions
          );
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

    await this.runCleartoolCommand(
      "undoCheckoutFile",
      new CmdArgs(["unco", rm], files),
      dirname(docs[0]?.fsPath),
      null,
      () => this.mUpdateEvent.fire(docs)
    );
  }

  async createVersionedObject(docs: Uri[]): Promise<void> {
    const files = docs.map((d: Uri) => {
      return this.wslPath(d.fsPath, false);
    });
    try {
      await this.runCleartoolCommand(
        "createVersionedObject",
        new CmdArgs(["mkelem", "-mkp", "-nc"], files),
        dirname(docs[0]?.fsPath),
        null,
        () => this.mUpdateEvent.fire(docs)
      );
    } catch (error) {
      window.showErrorMessage(`${getErrorMessage(error)}`, { modal: false });
    }
  }

  async createHijackedObject(docs: Uri[]): Promise<void> {
    if (this.mViewType === ViewType.Snapshot) {
      for (const d of docs) {
        fs.chmodSync(d.fsPath, 0o777);
        const nowTime = new Date();
        fs.utimesSync(d.fsPath, nowTime, nowTime);
      }
      this.mUpdateEvent.fire(docs);
    }
  }

  async cancelHijackedObject(docs: Uri[]): Promise<void> {
    if (this.mViewType === ViewType.Snapshot) {
      for (const d of docs) {
        await this.runCleartoolCommand(
          "cancelHijacked",
          new CmdArgs(["update", "-overwrite"], [d.fsPath]),
          dirname(d.fsPath),
          null,
          () => this.mUpdateEvent.fire([d])
        );
      }
    }
  }

  async checkinFileAction(docs: Uri[]): Promise<void> {
    const useClearDlg = this.configHandler.configuration.useClearDlg.value;
    if (useClearDlg) {
      for (const doc of docs) {
        if (type() === "Windows_NT") {
          exec(`cleardlg /checkin ${doc.fsPath}`, () => this.mUpdateEvent.fire([doc]));
        } else {
          if ((await UiControl.showCleartoolMsgBox()) === true) {
            this.checkinFile([doc]);
          }
        }
      }
    } else {
      await this.checkinFile(docs);
    }
  }

  async checkinFile(docs: Uri[]): Promise<void> {
    const defComment = this.configHandler.configuration.defaultComment.value;

    const cmd: CmdArgs = new CmdArgs(["ci"]);
    await this.doCheckinFiles(await this.prepareCheckinParams(defComment, docs, false, cmd), docs);
  }

  async checkinFiles(docs: Uri[], comment: string): Promise<void> {
    const cmd: CmdArgs = new CmdArgs(["ci"]);
    await this.doCheckinFiles(await this.prepareCheckinParams(comment, docs, true, cmd), docs);
  }

  private async prepareCheckinParams(comment: string, docs: Uri[], simple: boolean, args: CmdArgs) {
    let modifyPath = false;
    // simple mode: checkin via scm checkin all
    if (simple) {
      if (comment !== "") {
        args.params.push("-c");
        args.params.push(comment);
      } else {
        args.params.push("-nc");
      }
      modifyPath = true;
    } else {
      const ciArgTmpl = this.configHandler.configuration.checkinCommand.value;
      const cmdOpts = ciArgTmpl.trim().split(/\s+/);
      let newComment = "";
      let idx = cmdOpts.indexOf("${comment}");
      if (idx > -1) {
        if (comment) {
          newComment = comment;
        } else {
          newComment =
            (await window.showInputBox({
              ignoreFocusOut: true,
              prompt: "Checkin comment",
            })) ?? "";
        }
        cmdOpts[idx] = newComment;
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
      args.params = args.params.concat(cmdOpts);
      idx = args.params.indexOf("${filename}");
      if (idx > -1) {
        if (docs.length === 1) {
          args.params[idx] = this.wslPath(docs[0]?.fsPath, false);
        } else {
          args.params[idx] = "";
        }
      }
      if (docs.length > 1 || idx === -1) {
        modifyPath = true;
      }
    }
    if (modifyPath) {
      args.files = docs.map((d: Uri) => {
        return this.wslPath(d.fsPath, false);
      });
    }
    return args;
  }

  private async doCheckinFiles(args: CmdArgs, docs: Uri[]) {
    await this.runCleartoolCommand("checkinFiles", args, dirname(docs[0]?.fsPath), null, () =>
      this.mUpdateEvent.fire(docs)
    );
    if (this.configHandler.configuration.useLabelAtCheckin.value) {
      const newLabel = await UiControl.showCreateLabelInput();
      if (newLabel !== "") {
        for (const doc of docs) {
          await this.createLabelType(doc, newLabel);
          await this.applyLabel(doc, newLabel);
        }
      }
    }
  }

  versionTree(docs: Uri[]): void {
    for (const doc of docs) {
      this.runCleartoolCommand(
        "versionTree",
        new CmdArgs(["lsvtree", "-graphical"], [doc.fsPath]),
        dirname(doc.fsPath),
        null
      );
    }
  }

  diffWithPrevious(docs: Uri[]): void {
    for (const doc of docs) {
      this.runCleartoolCommand(
        "diffWithPrevious",
        new CmdArgs(["diff", "-graph", "-pred"], [doc.fsPath]),
        dirname(doc.fsPath),
        null
      );
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
      const cmd: CmdArgs = new CmdArgs(["lsco", ...cmdOpts]);
      await this.runCleartoolCommand("findCheckouts", cmd, wsf, null, (_code: number, output: string) => {
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
      });
    } catch (error) {
      this.outputChannel.appendLine(getErrorMessage(error), LogLevel.Error);
      window.showErrorMessage(`${getErrorMessage(error)}`, { modal: false });
    }
    return resNew;
  }

  /**
   * Searching view private files in all vobs of the current view
   */
  async findViewPrivate(): Promise<string[]> {
    const lscoArgTmpl = this.configHandler.configuration.findViewPrivateCommand.value;
    let resNew: string[] = [];
    let wsf = "";
    if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
      wsf = workspace.workspaceFolders[0].uri.fsPath;
    }
    try {
      const runInWsl = this.isRunningInWsl();
      const cmdOpts = lscoArgTmpl.split(" ");
      const cmd: CmdArgs = new CmdArgs([...cmdOpts]);
      await this.runCleartoolCommand("findViewPrivate", cmd, wsf, null, (_code: number, output: string) => {
        if (output.length > 0) {
          const suff = this.configHandler.configuration.viewPrivateFileSuffixes.value;
          const suffRe = new RegExp(suff, "i");
          const results: string[] = output.trim().split(/\r\n|\r|\n/);
          resNew = results
            .filter((v) => {
              return v.match(suffRe) !== null;
            })
            .map((e) => {
              if (e.startsWith("\\") && type() === "Windows_NT") {
                e = e.replace("\\", wsf.toUpperCase()[0] + ":\\");
              }
              if (runInWsl === true) {
                // e = this.wslPath(e, true, runInWsl);
                e = e
                  .replace(/\\/g, "/")
                  .replace(/^([A-Za-z]):/, (s: string, g1: string) => `/mnt/${g1.toLowerCase()}`);
              }
              return e;
            });
        }
      });
    } catch (error) {
      this.outputChannel.appendLine(getErrorMessage(error), LogLevel.Error);
      window.showErrorMessage(`${getErrorMessage(error)}`, { modal: false });
    }
    return resNew;
  }

  /**
   * Searching view private files in all vobs of the current view
   */
  async findHijacked(): Promise<string[]> {
    const lscoArgTmpl = this.configHandler.configuration.findHijackedCommand.value;
    let resNew: string[] = [];
    let wsf = "";
    if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
      wsf = workspace.workspaceFolders[0].uri.fsPath;
    }
    try {
      const runInWsl = this.isRunningInWsl();
      const cmdOpts = lscoArgTmpl.split(" ");
      const cmd: CmdArgs = new CmdArgs([...cmdOpts]);
      await this.runCleartoolCommand("findHijacked", cmd, wsf, null, (_code: number, output: string) => {
        if (output.length > 0) {
          const results: string[] = output.trim().split(/\r\n|\r|\n/);
          resNew = results
            .filter((v) => {
              return v.match(/hijacked/i) !== null;
            })
            .map((e) => {
              if (e.startsWith("\\") && type() === "Windows_NT") {
                e = e.replace("\\", wsf.toUpperCase()[0] + ":\\");
              }
              if (runInWsl === true) {
                // e = this.wslPath(e, true, runInWsl);
                e = e
                  .replace(/\\/g, "/")
                  .replace(/^([A-Za-z]):/, (s: string, g1: string) => `/mnt/${g1.toLowerCase()}`);
              }
              const idx = e.indexOf("@@");
              if (idx > -1) {
                e = e.substring(0, idx);
              }
              return e;
            });
        }
      });
    } catch (error) {
      this.outputChannel.appendLine(getErrorMessage(error), LogLevel.Error);
      window.showErrorMessage(`${getErrorMessage(error)}`, { modal: false });
    }
    return resNew;
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
          const cmd: CmdArgs = new CmdArgs(["catcs"]);
          await this.runCleartoolCommand(
            "hasConfigspec",
            cmd,
            p.uri.fsPath,
            null,
            (code: number, _output: string, error: string) => {
              //  Success only if command exit code is 0 and nothing on stderr
              result = code === 0 && error.length === 0;
            }
          );
          if (result !== false) {
            break;
          }
        }
      } catch {
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
      return (await this.getVersionInformation(iUri)).state !== CCVersionState.Untracked;
    } catch {
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
  async getVersionInformation(iUri: Uri, normalize = true): Promise<VersionType> {
    let fileVers = new VersionType();
    if (iUri !== undefined && this.isView === true) {
      const cwd = dirname(iUri.fsPath);
      await this.runCleartoolCommand(
        "getVersionInformation",
        new CmdArgs(["ls"], [iUri.fsPath]),
        cwd,
        null,
        (code: number, output: string, error: string) => {
          if (code === 0 && error.length === 0) {
            fileVers = this.getVersionString(output, normalize);
          }
        }
      );
    }
    return fileVers;
  }

  /**
   * Given a string as it is returned by cleartool ls -short, this function
   * can return the version information of that string
   *
   * @param iFileInfo a string with filename and version information
   * @returns string
   */
  getVersionString(iFileInfo: string, normalize: boolean): VersionType {
    const ver = new VersionType("not in a VOB");
    if (iFileInfo !== undefined && iFileInfo !== null && iFileInfo !== "") {
      const res = iFileInfo.match(/(((\S+)@@(\S+)(\s+\[hijacked\]){0,1}(.*){0,1})|(\S+))/i);
      if (res) {
        if (res.length > 0 && res[5] !== undefined) {
          ver.version = res[4];
          ver.state = CCVersionState.Hijacked;
        } else if (res.length > 0 && res[3] !== undefined && res[4] !== undefined) {
          ver.version = normalize ? res[4].replace(/\\/g, "/").trim() : res[4].trim();
          ver.state = CCVersionState.Versioned;
        } else if (res.length > 0 && res[7] !== undefined) {
          ver.version = "view private";
          ver.state = CCVersionState.Untracked;
        }
      }
    }
    return ver;
  }

  async updateDir(uri: Uri): Promise<void> {
    try {
      const msg: string | undefined = await this.updateObject(uri, 0);
      UiControl.showInformationMessage(`Update of ${msg} finished!`);
    } catch (error) {
      UiControl.showErrorMessage(getErrorMessage(error));
    }
  }

  async updateFile(uri: Uri): Promise<void> {
    try {
      const msg: string | undefined = await this.updateObject(uri, 1);
      UiControl.showInformationMessage(`Update of ${msg} finished!`);
    } catch (error) {
      UiControl.showErrorMessage(getErrorMessage(error));
    }
  }

  /**
   * @param filePath Uri of the selected file object in the explorer
   * @param updateType which one to update: 0=directory, 1=file
   */
  async updateObject(filePath: Uri, updateType: number): Promise<string | undefined> {
    let resultOut = "";

    if (window.activeTextEditor !== undefined) {
      const p = filePath?.fsPath === null ? window.activeTextEditor.document.fileName : filePath.fsPath;

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
        "updateObject",
        new CmdArgs(["update"], [updateFsObj]),
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

  async annotate(fileUri: Uri, ctrl: AnnotationController): Promise<void> {
    try {
      const content = await this.getAnnotatedFileContent(fileUri.fsPath);
      ctrl.setAnnotationInText(content);
    } catch (error) {
      const message = getErrorMessage(error).replace(/[\r\n]+/g, " ");
      UiControl.showErrorMessage(message);
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
        "getAnnotationFileContent",
        new CmdArgs(["annotate", "-out", "-", "-nhe", "-fmt", `"${fmt}${sep}"`, `${fileP}`]),
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
    } catch {
      return true;
    }
  }

  private async getCurrentActivity(): Promise<string> {
    let resultOut = "";
    if (workspace.workspaceFolders !== undefined) {
      let errorRes = "";
      await this.runCleartoolCommand(
        "getCurrentActivity",
        new CmdArgs(["lsactivity", "-cac", "-fmt", `"%n"`]),
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
        "getQuickPickActivities",
        new CmdArgs(["lsactivity"]),
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
        "setViewActivities",
        new CmdArgs(["setactivity", `${id}`]),
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

  async getFilePredecessorVersion(fsPath: string): Promise<VersionType> {
    const version = new VersionType();
    if (fsPath !== "") {
      await this.runCleartoolCommand(
        "getFilePredecessorVersion",
        new CmdArgs(["describe", "-fmt", "%[version_predecessor]p", fsPath]),
        dirname(fsPath),
        null,
        (_code: number, output: string) => {
          //  Only log stdout contents here; stderr is logged by runCleartoolCommand if non-empty
          version.version = output;
        }
      );
    }
    return version;
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
        "readFileAtVersion",
        new CmdArgs(["get", "-to", tempFile], [fsPath], version),
        workspace.workspaceFolders[0].uri.fsPath,
        null,
        (_code: number, output: string) => {
          //  Only log stdout contents here; stderr is logged by runCleartoolCommand if non-empty
          console.log(output);
        }
      );
    }
    const enc = (
      this.configHandler.configuration.diffViewEncoding.value !== ""
        ? this.configHandler.configuration.diffViewEncoding.value
        : "utf8"
    ) as string;
    return fs.readFileSync(ret.fsPath, { encoding: enc });
  }

  private async runCleartoolCommand(
    cmdId: string,
    cmd: CmdArgs,
    cwd: string,
    onData: ((data: string[]) => void) | null,
    onFinished?: (code: number, output: string, error: string) => void
  ): Promise<string | undefined> {
    const executable: string = this.mExecCmd.executable();
    try {
      fs.accessSync(cwd, fs.constants.F_OK);
    } catch {
      this.outputChannel.appendLine(`CWD (${cwd}) not found`, LogLevel.Warning);
      return Promise.reject();
    }
    // convert path to run cleartool windows cmd
    // wsl mount point for external drives is /mnt
    // convert backslash to slash
    cmd.files = cmd.files.map((f) => this.wslPath(f, false));

    this.outputChannel.appendLine(cmd.getCmd().toString(), LogLevel.Debug);
    const command = spawn(executable, cmd.getCmd(), { cwd: cwd, env: process.env, detached: true });

    // remove old running command
    this.killRunningCommand(cmdId, command.pid);
    this.mRunningCommands.set(cmdId, command);
    this.outputChannel.appendLine(`Command ${cmdId} (${command.pid}) started`, LogLevel.Trace);

    let allData: Buffer = Buffer.alloc(0);
    let cmdErrMsg = "";
    return new Promise<string | undefined>((resolve, reject) => {
      command.stdout.on("data", (data) => {
        let res = "";
        if (Buffer.isBuffer(data)) {
          allData = Buffer.concat([allData, data], allData.length + data.length);
          res = data.toString();
        }
        if (onData !== null && typeof onData === "function") {
          onData(res.split(/\r\n|\r|\n/).filter((s: string) => s.length > 0));
        }
      });
      command.stderr.on("data", (data) => {
        let msg = "";
        if (Buffer.isBuffer(data)) {
          msg = data.toString();
        }
        cmdErrMsg = `${cmdErrMsg}${msg}`;
      });

      command.on("close", (code, signal) => {
        this.outputChannel.appendLine(
          `Command ${cmdId} (${command.pid}), with Signal (${signal}) deleted`,
          LogLevel.Trace
        );
        if (this.mRunningCommands.has(cmdId)) {
          if (this.mRunningCommands.get(cmdId)?.pid === command.pid) {
            this.mRunningCommands.delete(cmdId);
            this.outputChannel.appendLine(`Command ${cmdId} (${command.pid}) deleted`, LogLevel.Trace);
          }
          this.outputChannel.appendLine(`Command ${cmdId} (${command.pid}) finished`, LogLevel.Trace);
        }
        if (cmdErrMsg !== "") {
          //  If something was printed on stderr, log it, regardless of the exit code
          this.outputChannel.appendLine(`exit code ${code}, stderr: ${cmdErrMsg}`, LogLevel.Error);
        } else {
          this.outputChannel.appendLine(`${allData.toString()}`, LogLevel.Debug);
        }
        if (code !== null && code !== 0 && this.isView && cmdErrMsg !== "") {
          reject(cmdErrMsg);
        }
        if (signal !== "SIGKILL" && typeof onFinished === "function") {
          onFinished(code, allData.toString(), cmdErrMsg);
        }
        resolve(undefined);
      });
    });
  }

  private async killRunningCommand(cmdId: string, pid: number): Promise<void> {
    if (this.mRunningCommands.has(cmdId)) {
      const cmd = this.mRunningCommands.get(cmdId);
      if (cmd && (cmd.pid === pid || pid === 0)) {
        const pidId = cmd.pid;
        this.outputChannel.appendLine(`Going to kill ${cmdId} (${pidId})`, LogLevel.Trace);
        if (process.platform === "win32") {
          exec(`taskkill /PID ${pidId} /T /F`);
        } else {
          process.kill(-pidId, "SIGKILL");
        }
        this.outputChannel.appendLine(`Command ${cmdId} (${pidId}) killed`, LogLevel.Trace);
        this.mRunningCommands.delete(cmdId);
        this.outputChannel.appendLine(`Command ${cmdId} (${pidId}) deleted`, LogLevel.Trace);
      }
    }
  }

  public killUpdateFindViewPrivate(): void {
    this.killRunningCommand("findViewPrivate", 0);
  }

  public killUpdateFindHijacked(): void {
    this.killRunningCommand("findHijacked", 0);
  }

  private async detectViewType(): Promise<ViewType> {
    let lines: string[] = [];
    let viewType: ViewType = ViewType.Unknown;

    const filterGlobalPathLines = (l: string) => {
      if (l.length === 0) {
        return false;
      }
      return l.match(/view uuid: ([\w.:]+)/gi) ?? l.match(/view attributes:\s+snapshot/gi);
    };
    if (workspace.workspaceFolders !== undefined) {
      await this.runCleartoolCommand(
        "detectViewType",
        new CmdArgs(this.lsView),
        workspace.workspaceFolders[0].uri.fsPath,
        null,
        (_code: number, output: string) => {
          lines = output.split(/\r\n|\r|\n/).filter((s) => s.length > 0);
          const resLines: string[] = lines.filter(filterGlobalPathLines);
          if (resLines.length === 0) {
            return;
          }
          if (resLines.length > 1 && resLines[1].match(/View attributes: snapshot/)) {
            viewType = ViewType.Snapshot;
            if (resLines.length > 1 && resLines[1].match(/webview/i)) {
              viewType = ViewType.Webview;
            }
          } else {
            viewType = ViewType.Dynamic;
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
            this.outputChannel.appendLine(`cleartool edcs error: ${error.message}`, LogLevel.Error);
            reject(error.message);
          } else {
            this.outputChannel.appendLine(`cleartool edcs stderr: ${stderr}`, LogLevel.Error);
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
        } catch {
          ret = false;
        }
      }
    }
    return ret;
  }

  public async existsLabelType(doc: Uri, newLabel: string): Promise<boolean> {
    let retVal = false;
    if (newLabel !== "") {
      retVal = true;
      const args = new CmdArgs(["lstype", `lbtype:${newLabel}`]);
      try {
        await this.runCleartoolCommand(
          "existsLabelType",
          args,
          dirname(doc.fsPath),
          null,
          (_code: number, output: string, _error: string) => {
            if (_error.length > 0) {
              retVal = false;
            }
          }
        );
      } catch (e) {
        this.outputChannel.appendLine(getErrorMessage(e), LogLevel.Information);
        return false;
      }
    }
    return retVal;
  }

  public async createLabelType(doc: Uri, newLabel: string): Promise<void> {
    if (newLabel !== "") {
      if ((await this.existsLabelType(doc, newLabel)) === false) {
        const args = new CmdArgs(["mklbtype", "-nc", newLabel]);
        try {
          await this.runCleartoolCommand(
            "createLabelType",
            args,
            dirname(doc.fsPath),
            null,
            (_code: number, output: string) => {
              this.outputChannel.appendLine(output);
            }
          );
        } catch (e) {
          this.outputChannel.appendLine(getErrorMessage(e), LogLevel.Error);
        }
      }
    }
  }

  public async applyLabel(doc: Uri, newLabel: string): Promise<void> {
    if (newLabel !== "") {
      if ((await this.existsLabelType(doc, newLabel)) === true) {
        const args = new CmdArgs(["mklabel", "-replace", newLabel], [doc.fsPath]);
        try {
          await this.runCleartoolCommand(
            "applyLabel",
            args,
            dirname(doc.fsPath),
            null,
            (_code: number, output: string) => {
              this.outputChannel.appendLine(output);
            }
          );
        } catch (e) {
          this.outputChannel.appendLine(getErrorMessage(e), LogLevel.Error);
        }
      }
    }
  }

  public async getVersionsOfFile(file: Uri): Promise<string[]> {
    const version = await this.getVersionInformation(file);
    let retVal: string[] = [];
    if (file && file.fsPath !== "") {
      await this.runCleartoolCommand(
        "getVersionsOfFile",
        new CmdArgs(["lsvtree", "-short"], [file.fsPath], version.version),
        dirname(file.fsPath),
        null,
        (_code: number, output: string) => {
          if (_code === 0 && output !== "") {
            retVal = output
              .split("\n")
              .filter((item: string) => {
                const idx = item.indexOf("@@");
                if (idx > -1) {
                  return item.trim().match(/[\d]$/gi);
                }
                return false;
              })
              .map((item: string) => {
                const idx = item.indexOf("@@");
                if (idx > -1) {
                  return item.substring(idx + "@@".length).trim();
                }
                return item;
              })
              .sort((a, b) => {
                return b.localeCompare(a);
              });
          }
        }
      );
    }
    return retVal;
  }
}

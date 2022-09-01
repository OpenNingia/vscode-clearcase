import { workspace, WorkspaceFolder, Uri, EventEmitter } from "vscode";
import { existsSync, readFileSync, statSync } from "fs";
import { join, dirname, sep } from "path";
import ignore, { Ignore } from "ignore";
import { ModelHandler } from "./model";

export class IgnoreHandler {
  private fileIgnores: FileIgnore[];
  private mOnFilterRefreshed: EventEmitter<void>;

  constructor(private mFsWatch: ModelHandler) {
    this.mOnFilterRefreshed = new EventEmitter<void>();
    this.fileIgnores = [];
    this.init();
  }

  get onFilterRefreshed(): EventEmitter<void> {
    return this.mOnFilterRefreshed;
  }

  public init() {
    this.fileIgnores = [];
    workspace.workspaceFolders?.forEach((folder: WorkspaceFolder) => {
      const lM = this.mFsWatch.addWatcher(join(folder.uri.fsPath, ".ccignore"));
      lM.onWorkspaceChanged((fileObj) => this.refreshFilter(fileObj));
      lM.onWorkspaceCreated((fileObj) => this.refreshFilter(fileObj));
      lM.onWorkspaceDeleted((fileObj) => this.removeFilter(fileObj));
      const dir = this.appendSeparator(folder.uri.fsPath);
      this.fileIgnores.push(new FileIgnore(Uri.file(dir)));
    });
  }

  public getFolderIgnore(path: Uri | string): FileIgnore | null {
    const t = this.appendSeparator(typeof path === "string" ? path : path.fsPath);
    for (const ignore of this.fileIgnores) {
      if (t.startsWith(ignore.pathStr) && ignore.hasIgnore === true) {
        return ignore;
      }
    }
    return null;
  }

  public refreshFilter(fileObj: Uri) {
    const dir = this.appendSeparator(fileObj.fsPath);
    for (let i = 0; i < this.fileIgnores.length; i++) {
      if (this.fileIgnores[i].pathStr === dir) {
        this.fileIgnores[i] = new FileIgnore(Uri.file(dir));
        this.mOnFilterRefreshed.fire();
        return;
      }
    }
    this.fileIgnores.push(new FileIgnore(Uri.file(dir)));
    this.mOnFilterRefreshed.fire();
  }

  public removeFilter(fileObj: Uri) {
    const dir = this.appendSeparator(fileObj.fsPath);
    for (let i = 0; i < this.fileIgnores.length; i++) {
      if (this.fileIgnores[i].pathStr === dir) {
        this.fileIgnores.splice(i, 1);
        this.mOnFilterRefreshed.fire();
        return;
      }
    }
  }

  public appendSeparator(path: string): string {
    const ps = statSync(path);
    if (ps.isFile() === true) {
      path = dirname(path);
    }
    if (path.substr(-1, 1) !== sep) {
      return path + sep;
    }
    return path;
  }
}

export class FileIgnore {
  private pathObj: Uri;
  private hasIgnoreVal = false;
  private ignoreObj: Ignore;

  constructor(path: Uri) {
    this.ignoreObj = ignore();
    this.pathObj = path;
    const p = join(path.fsPath, ".ccignore");
    if (existsSync(p) === true) {
      this.hasIgnoreVal = true;
      this.ignoreObj.add(readFileSync(p).toString());
    }
  }

  get path(): Uri {
    return this.pathObj;
  }

  get pathStr(): string {
    let p = this.pathObj?.fsPath || "";
    p = p.substr(-1, 1) !== sep ? p + sep : p;
    return p;
  }

  get ignore(): Ignore {
    return this.ignoreObj;
  }

  get hasIgnore(): boolean {
    return this.hasIgnoreVal;
  }
}

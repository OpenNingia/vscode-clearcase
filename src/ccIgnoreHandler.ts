import { workspace, WorkspaceFolder, Uri, EventEmitter } from "vscode";
import { existsSync, readFileSync, statSync } from "fs";
import { join, dirname, sep } from "path";
import ignore from "ignore";
import { Model, ModelHandler } from "./model";

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
      lM.onWorkspaceChanged(this.refreshFilter, this);
      lM.onWorkspaceCreated(this.refreshFilter, this);
      lM.onWorkspaceDeleted(this.removeFilter, this);
      const dir = this.appendSeparator(folder.uri.fsPath);
      this.fileIgnores.push(new FileIgnore(Uri.file(dir)));
    });
  }

  public getFolderIgnore(path: Uri | string | undefined): FileIgnore | null {
    for (let i = 0; i < this.fileIgnores.length; i++) {
      const p = "";
      if (typeof path === "string") {
        const t = this.appendSeparator(path);
      } else {
        if (path !== undefined) {
          const t = this.appendSeparator(path.fsPath);

          if (t.indexOf(this.fileIgnores[i].pathStr) === 0 && this.fileIgnores[i].hasIgnore === true) {
            return this.fileIgnores[i];
          }
        }
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
  private pathObj: Uri | null = null;
  private hasIgnoreVal = false;
  private ignoreObj: any = null;
  constructor(path: Uri) {
    this.init(path);
  }

  public init(path: Uri) {
    this.ignoreObj = ignore();
    this.pathObj = path;
    const p = join(path.fsPath, ".ccignore");
    if (existsSync(p) === true) {
      this.hasIgnoreVal = true;
      this.ignoreObj.add(readFileSync(p).toString());
    }
  }

  public get path(): Uri | null {
    return this.pathObj;
  }

  public get pathStr(): string {
    let p = this.pathObj?.fsPath || "";
    p = p.substr(-1, 1) !== sep ? p + sep : p;
    return p;
  }

  public get ignore(): any {
    return this.ignoreObj;
  }

  public get hasIgnore(): boolean {
    return this.hasIgnoreVal;
  }
}

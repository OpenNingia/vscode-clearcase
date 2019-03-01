import { workspace, WorkspaceFolder, Uri } from "vscode";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import ignore from "ignore";
import { Model, ModelHandler } from "./model";

export class IgnoreHandler {
  fileIgnores: FileIgnore[];

  constructor(private m_fsWatch: ModelHandler) {
    this.init();
  }
  
  public init() {
    this.fileIgnores = [];
    workspace.workspaceFolders.forEach((folder: WorkspaceFolder) => {
      let l_m = this.m_fsWatch.addWatcher(join(folder.uri.fsPath, '.ccignore'));
      l_m.onWorkspaceChanged(this.refreshFilter, this);
      l_m.onWorkspaceCreated(this.refreshFilter, this);
      l_m.onWorkspaceDeleted(this.removeFilter, this);
      this.fileIgnores.push(new FileIgnore(folder.uri));
    });
  }

  public getFolderIgnore(path: Uri | string): FileIgnore | null {
    for (let i = 0; i < this.fileIgnores.length; i++) {
      if (typeof path == "string") {
        if (path.indexOf(this.fileIgnores[i].Path.fsPath) == 0 && this.fileIgnores[i].HasIgnore === true)
          return this.fileIgnores[i];
      }
      else {
        if (path.fsPath.indexOf(this.fileIgnores[i].Path.fsPath) == 0 && this.fileIgnores[i].HasIgnore === true)
          return this.fileIgnores[i];
      }
    }
    return null;
  }

  public refreshFilter(fileObj:Uri) {
    const dir = dirname(fileObj.fsPath);
    for (let i = 0; i < this.fileIgnores.length; i++) {
      if(this.fileIgnores[i].Path.fsPath == dir) {
        this.fileIgnores[i] = new FileIgnore(Uri.file(dir));
        return;
      }
    }
    this.fileIgnores.push(new FileIgnore(Uri.file(dir)));
  }

  public removeFilter(fileObj:Uri) {
    const dir = dirname(fileObj.fsPath);
    for (let i = 0; i < this.fileIgnores.length; i++) {
      if(this.fileIgnores[i].Path.fsPath == dir) {
        this.fileIgnores.splice(i, 1);
        return;
      }
    }
    this.fileIgnores.push(new FileIgnore(Uri.file(dir)));
  }
}

export class FileIgnore {
  private path: Uri;
  private hasIgnore: boolean = false;
  private ignore: any = null;
  constructor(path: Uri) {
    this.init(path);
  }

  public init(path: Uri) {
    this.ignore = ignore();
    this.path = path;
    let p = join(path.fsPath, ".ccignore");
    if (existsSync(p) == true) {
      this.hasIgnore = true;
      this.ignore.add(readFileSync(p).toString());
    }
  }

  public get Path(): Uri {
    return this.path;
  }

  public get Ignore(): any {
    return this.ignore;
  }

  public get HasIgnore(): boolean {
    return this.hasIgnore;
  }
}
import { workspace, WorkspaceFolder, Uri, EventEmitter } from "vscode";
import { existsSync, readFileSync, statSync } from "fs";
import { join, dirname, sep } from "path";
import ignore from "ignore";
import { Model, ModelHandler } from "./model";

export class IgnoreHandler {
  private fileIgnores: FileIgnore[];
  private m_onFilterRefreshed: EventEmitter<void>;


  constructor(private m_fsWatch: ModelHandler) {
    this.m_onFilterRefreshed = new EventEmitter<void>();
    this.init();
  }

  get OnFilterRefreshed(): EventEmitter<void> {
    return this.m_onFilterRefreshed;
  }
  
  public init() {
    this.fileIgnores = [];
    workspace.workspaceFolders.forEach((folder: WorkspaceFolder) => {
      let l_m = this.m_fsWatch.addWatcher(join(folder.uri.fsPath, '.ccignore'));
      l_m.onWorkspaceChanged(this.refreshFilter, this);
      l_m.onWorkspaceCreated(this.refreshFilter, this);
      l_m.onWorkspaceDeleted(this.removeFilter, this);
      let dir = this.appendSeparator(folder.uri.fsPath);
      this.fileIgnores.push(new FileIgnore(Uri.file(dir)));
    });
  }

  public getFolderIgnore(path: Uri | string): FileIgnore | null {
    for (let i = 0; i < this.fileIgnores.length; i++) {
      let p:string = "";
      if (typeof path == "string") {
        let t = this.appendSeparator(path);
      }
      else {
        let t = this.appendSeparator(path.fsPath);
      
        if (t.indexOf(this.fileIgnores[i].PathStr) == 0 && this.fileIgnores[i].HasIgnore === true)
            return this.fileIgnores[i];
      }
    }
    return null;
  }

  public refreshFilter(fileObj:Uri) {
    let dir = this.appendSeparator(fileObj.fsPath);
    for (let i = 0; i < this.fileIgnores.length; i++) {
      if(this.fileIgnores[i].PathStr == dir) {
        this.fileIgnores[i] = new FileIgnore(Uri.file(dir));
        this.m_onFilterRefreshed.fire();
        return;
      }
    }
    this.fileIgnores.push(new FileIgnore(Uri.file(dir)));
    this.m_onFilterRefreshed.fire();
  }

  public removeFilter(fileObj:Uri) {
    let dir = this.appendSeparator(fileObj.fsPath);
    for (let i = 0; i < this.fileIgnores.length; i++) {
      if(this.fileIgnores[i].PathStr == dir) {
        this.fileIgnores.splice(i, 1);
        this.m_onFilterRefreshed.fire();
        return;
      }
    }
  }

  public appendSeparator(path:string): string {
    const ps = statSync(path);
    if( ps.isFile() === true )
      path = dirname(path);
    if( path.substr(-1, 1) !== sep )
      return path + sep;
    return path;
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

  public get PathStr(): string {
    let p = this.Path.fsPath;
    p = p.substr(-1, 1) !== sep ? p+sep : p;
    return p;
  }

  public get Ignore(): any {
    return this.ignore;
  }

  public get HasIgnore(): boolean {
    return this.hasIgnore;
  }
}
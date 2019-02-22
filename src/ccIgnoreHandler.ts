import { workspace, WorkspaceFolder, Uri } from "vscode";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import ignore from "ignore";

export class IgnoreHandler {
  fileIgnores: FileIgnore[] = [];

  constructor() {
    workspace.workspaceFolders.forEach((folder: WorkspaceFolder) => {
      this.fileIgnores.push(new FileIgnore(folder.uri));
    });
  }

  public getFolderIgnore(path: Uri | string): FileIgnore | null {
    for (let i = 0; i < this.fileIgnores.length; i++) {
      if (typeof path == "string") {
        if (this.fileIgnores[i].Path.fsPath == path)
          return this.fileIgnores[i];
      }
      else {
        if (this.fileIgnores[i].Path == path && this.fileIgnores[i].HasIgnore === true)
          return this.fileIgnores[i];
      }
    }
    return null;
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
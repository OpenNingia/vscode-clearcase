import { accessSync } from "fs";
import { workspace } from "vscode";

class FileType {
  public constructor(public found: boolean, public name: string) {}
}

export class MappedList {
  private mUntrackedList: Map<string, FileType[]> | null;

  public constructor() {
    this.mUntrackedList = null;
    if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
      this.mUntrackedList = new Map<string, FileType[]>();
      workspace.workspaceFolders.forEach((val) => {
        this.mUntrackedList?.set(val.uri.fsPath, []);
      });
    }
  }

  public exists(iVal: string): boolean {
    if (this.mUntrackedList !== null) {
      const keys = this.mUntrackedList.keys();
      for (const key of keys) {
        if (iVal.indexOf(key) > -1) {
          const v = this.mUntrackedList.get(key);
          const o = v?.find((val) => val.name === iVal);
          if (undefined !== o) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public addString(iVal: string) {
    if (this.mUntrackedList !== null && workspace.workspaceFolders !== undefined) {
      let i = 0;
      for (; i < workspace.workspaceFolders.length; i++) {
        if (iVal.indexOf(workspace.workspaceFolders[i].uri.fsPath) > -1) {
          break;
        }
      }
      if (i < workspace.workspaceFolders.length) {
        const v = this.mUntrackedList.get(workspace.workspaceFolders[i].uri.fsPath);
        if (v !== undefined) {
          v.push(new FileType(true, iVal));
          this.mUntrackedList.set(workspace.workspaceFolders[i].uri.fsPath, v);
        }
      }
    }
  }

  public addStringByKey(iVal: string, iKey: string) {
    if (this.mUntrackedList !== null) {
      if (this.mUntrackedList.get(iKey) !== undefined) {
        const v = this.mUntrackedList.get(iKey);
        const o = v?.find((val) => val.name === iVal);
        if (undefined === o && v !== undefined) {
          v.push(new FileType(true, iVal));
          this.mUntrackedList.set(iKey, v);
        } else if (o !== undefined) {
          o.found = true;
        }
      }
    }
  }

  public addStringsByKey(iVal: FileType[], iKey: string) {
    if (this.mUntrackedList !== null) {
      if (this.mUntrackedList.get(iKey) !== undefined) {
        this.mUntrackedList.set(iKey, iVal);
      }
    }
  }

  public getStringsByKey(iKey: string | undefined): string[] | undefined {
    if (iKey === undefined) {
      return;
    }
    if (this.mUntrackedList !== null) {
      if (this.mUntrackedList.get(iKey) !== undefined) {
        return this.mUntrackedList.get(iKey)?.map((val) => val.name);
      }
    }
    return [];
  }

  public clearStringsOfKey(iKey: string) {
    if (this.mUntrackedList !== null) {
      if (this.mUntrackedList.get(iKey) !== undefined) {
        this.mUntrackedList.set(iKey, []);
      }
    }
  }

  public parse(filelist: string[]) {
    if (filelist !== null && this.mUntrackedList !== null) {
      for (let i = 0; i < filelist.length; i = i + 2) {
        this.mUntrackedList.set(
          filelist[i],
          filelist[i + 1].split(";").map((val) => new FileType(false, val))
        );
      }
    }
  }

  public stringify(): string[] {
    const f = [];
    if (this.mUntrackedList !== null) {
      const keys = this.mUntrackedList.keys();
      for (const key of keys) {
        const objs = this.mUntrackedList
          .get(key)
          ?.map((val) => val.name)
          .join(";");
        if (objs !== undefined) {
          f.push(key);
          f.push(objs);
        }
      }
    }
    return f;
  }

  public cleanMap() {
    if (this.mUntrackedList !== null) {
      const keys = this.mUntrackedList.keys();
      for (const key of keys) {
        const objs = this.mUntrackedList.get(key)?.filter((val) => val.found);
        if (objs !== undefined) {
          this.mUntrackedList.set(
            key,
            objs.map((val) => {
              val.found = false;
              return val;
            })
          );
        }
      }
    }
  }

  public updateEntryExistsOnFileSystem() {
    if (this.mUntrackedList !== null) {
      const keys = this.mUntrackedList.keys();
      for (const key of keys) {
        const objs = this.mUntrackedList.get(key)?.filter((val) => {
          try {
            accessSync(val.name);
            val.found = true;
          } catch {
            val.found = false;
          }
        });
        if (objs !== undefined) {
          this.mUntrackedList.set(key, objs);
        }
      }
    }
  }

  public resetFoundState() {
    if (this.mUntrackedList !== null) {
      const keys = this.mUntrackedList.keys();
      for (const key of keys) {
        const objs = this.mUntrackedList.get(key);
        if (objs !== undefined) {
          this.mUntrackedList.set(
            key,
            objs.map((val) => {
              val.found = false;
              return val;
            })
          );
        }
      }
    }
  }
}

import { workspace } from "vscode";

class FileType {
  public constructor(
    public found:boolean,
    public name:string )
  {}
}

export class MappedList {
  private m_untrackedList: Map<string, FileType[]>;

  public constructor() {
    this.m_untrackedList = null;
    if (workspace.workspaceFolders.length > 0) {
      this.m_untrackedList = new Map<string, FileType[]>();
      workspace.workspaceFolders.forEach(val => {
        this.m_untrackedList.set(val.uri.fsPath, []);
      });
    }
  }

  public exists(i_val: string): boolean {
    if (this.m_untrackedList !== null) {
      const keys = this.m_untrackedList.keys();
      for (let key of keys) {
        if (i_val.indexOf(key) > -1) {
          let v = this.m_untrackedList.get(key);
          let o = v.find((val) => val.name === i_val);
          if( undefined !== o )
            return true;
        }
      }
    }
    return false;
  }

  public addString(i_val: string) {
    if (this.m_untrackedList !== null) {
      let i = 0;
      for (; i < workspace.workspaceFolders.length; i++) {
        if (i_val.indexOf(workspace.workspaceFolders[i].uri.fsPath) > -1) {
          break;
        }
      }
      if (i < workspace.workspaceFolders.length) {
        let v = this.m_untrackedList.get(workspace.workspaceFolders[i].uri.fsPath);
        v.push(new FileType(true, i_val));
        this.m_untrackedList.set(workspace.workspaceFolders[i].uri.fsPath, v);
      }
    }
  }

  public addStringByKey(i_val: string, i_key: string) {
    if (this.m_untrackedList !== null) {
      if (this.m_untrackedList.get(i_key) !== undefined) {
        let v = this.m_untrackedList.get(i_key);
        let o = v.find((val) => val.name === i_val);
        if( undefined === o ) {
          v.push(new FileType(true, i_val));
          this.m_untrackedList.set(i_key, v);
        } else {
          o.found = true;
        }
      }
    }
  }

  public addStringsByKey(i_val: FileType[], i_key: string) {
    if (this.m_untrackedList !== null) {
      if (this.m_untrackedList.get(i_key) !== undefined) {
        this.m_untrackedList.set(i_key, i_val);
      }
    }
  }

  public getStringsByKey(i_key: string): string[] {
    if (this.m_untrackedList !== null) {
      if (this.m_untrackedList.get(i_key) !== undefined) {
        return this.m_untrackedList.get(i_key).map((val) => val.name);
      }
    }
    return [];
  }

  public clearStringsOfKey(i_key: string) {
    if (this.m_untrackedList !== null) {
      if (this.m_untrackedList.get(i_key) !== undefined) {
        this.m_untrackedList.set(i_key, []);
      }
    }
  }

  public parse(filelist: string[]) {
    if( filelist !== null && (this.m_untrackedList !== null) ) {
      for(let i=0; i < filelist.length; i=i+2) {
        this.m_untrackedList.set(filelist[i], filelist[i+1].split(";").map((val) => new FileType(false, val)));
      }
    }
  }

  public stringify() : string[] {
    let f = [];
    if( this.m_untrackedList !== null ) {
      const keys = this.m_untrackedList.keys();
      for (let key of keys) {
        let objs = this.m_untrackedList.get(key).map((val) => val.name).join(";");
        f.push(key);
        f.push(objs);
      }
    }
    return f;
  }

  public cleanMap() {
    if( this.m_untrackedList !== null ) {
      const keys = this.m_untrackedList.keys();
      for (let key of keys) {
        let objs = this.m_untrackedList.get(key).filter((val) => val.found);
        this.m_untrackedList.set(key, objs.map((val) => {
          val.found = false;
          return val;
        }));
      }
    }
  }

  public resetFoundState() {
    if( this.m_untrackedList !== null ) {
      const keys = this.m_untrackedList.keys();
      for (let key of keys) {
        let objs = this.m_untrackedList.get(key);
        this.m_untrackedList.set(key, objs.map((val) => {
          val.found = false;
          return val;
        }));
      }
    }
  }
}
import { workspace } from "vscode";

export class MappedList {
  private m_untrackedList: Map<string, string[]>;

  public constructor() {
    this.m_untrackedList = null;
    if (workspace.workspaceFolders.length > 0) {
      this.m_untrackedList = new Map<string, string[]>();
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
          if( v.indexOf(i_val) > -1 )
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
        v.push(i_val);
        this.m_untrackedList.set(workspace.workspaceFolders[i].uri.fsPath, v);
      }
    }
  }

  public addStringByKey(i_val: string, i_key: string) {
    if (this.m_untrackedList !== null) {
      if (this.m_untrackedList.get(i_key) !== undefined) {
        let v = this.m_untrackedList.get(i_key);
        if (v.indexOf(i_val) === -1) {
          v.push(i_val);
          this.m_untrackedList.set(i_key, v);
        }
      }
    }
  }

  public getStringsByKey(i_key: string): string[] {
    if (this.m_untrackedList !== null) {
      if (this.m_untrackedList.get(i_key) !== undefined) {
        return this.m_untrackedList.get(i_key);
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
}
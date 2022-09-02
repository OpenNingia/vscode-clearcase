import { Event, Disposable, Uri, workspace } from "vscode";

export interface IDisposable {
  dispose(): void;
}

export function dispose<T extends IDisposable>(disposables: T[]): T[] {
  disposables.forEach((d) => d.dispose());
  return [];
}

export class ModelHandler {
  private mModels: Model[] | undefined;

  init(): void {
    this.mModels = [];
  }

  addWatcher(filter = "**"): Model {
    const lM = new Model();
    lM.init(filter);
    this.mModels?.push(lM);
    return lM;
  }
}

export class Model implements Disposable {
  private disposables: Disposable[] = [];
  private _onWorkspaceCreated!: Event<Uri>;
  private _onWorkspaceChanged!: Event<Uri>;
  private _onWorkspaceDeleted!: Event<Uri>;

  get onWorkspaceCreated(): Event<Uri> {
    return this._onWorkspaceCreated;
  }
  
  get onWorkspaceChanged(): Event<Uri> {
    return this._onWorkspaceChanged;
  }

  get onWorkspaceDeleted(): Event<Uri> {
    return this._onWorkspaceDeleted;
  }

  init(filter = "**"): void {
    const fsWatcher = workspace.createFileSystemWatcher(filter);
    this._onWorkspaceCreated = fsWatcher.onDidCreate;
    this._onWorkspaceChanged = fsWatcher.onDidChange;
    this._onWorkspaceDeleted = fsWatcher.onDidDelete;
    this.disposables.push(fsWatcher);
  }

  dispose(): void {
    this.disposables = dispose(this.disposables);
  }
}

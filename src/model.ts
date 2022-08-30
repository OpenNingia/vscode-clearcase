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

  public init() {
    this.mModels = [];
  }

  public addWatcher(filter = "**"): Model {
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

  public get onWorkspaceCreated(): Event<Uri> {
    return this._onWorkspaceCreated;
  }
  public get onWorkspaceChanged(): Event<Uri> {
    return this._onWorkspaceChanged;
  }
  public get onWorkspaceDeleted(): Event<Uri> {
    return this._onWorkspaceDeleted;
  }

  public init(filter = "**") {
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

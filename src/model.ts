'use strict';

import { Event, Disposable, Uri, workspace } from 'vscode';

export interface IDisposable {
    dispose(): void;
}

export function dispose<T extends IDisposable>(disposables: T[]): T[] {
    disposables.forEach(d => d.dispose());
    return [];
}

export function toDisposable(dispose: () => void): IDisposable {
    return { dispose };
}

export function combinedDisposable(disposables: IDisposable[]): IDisposable {
    return toDisposable(() => dispose(disposables));
}

export const EmptyDisposable = toDisposable(() => null);

export function mapEvent<I, O>(event: Event<I>, map: (i: I) => O): Event<O> {
    return (listener, thisArgs = null, disposables?) => event(i => listener.call(thisArgs, map(i)), null, disposables);
}

export function filterEvent<T>(event: Event<T>, filter: (e: T) => boolean): Event<T> {
    return (listener, thisArgs = null, disposables?) => event(e => filter(e) && listener.call(thisArgs, e), null, disposables);
}

export function anyEvent<T>(...events: Event<T>[]): Event<T> {
    return (listener, thisArgs = null, disposables?) => {
        const result = combinedDisposable(events.map(event => event(i => listener.call(thisArgs, i))));

        if (disposables) {
            disposables.push(result);
        }

        return result;
    };
}

export class Model implements Disposable {

    private disposables: Disposable[] = [];
    private _onWorkspaceCreated: Event<Uri>;
    private _onWorkspaceChanged: Event<Uri>;
    private _onWorkspaceDeleted: Event<Uri>;

    public get onWorkspaceCreated(): Event<Uri> {
        return this._onWorkspaceCreated;
    }
    public get onWorkspaceChanged(): Event<Uri> {
        return this._onWorkspaceChanged;
    }
    public get onWorkspaceDeleted(): Event<Uri> {
        return this._onWorkspaceDeleted;
    }

    constructor() {
        const fsWatcher = workspace.createFileSystemWatcher('**');
        this._onWorkspaceCreated = fsWatcher.onDidCreate;
        this._onWorkspaceChanged = fsWatcher.onDidChange;
        this._onWorkspaceDeleted = fsWatcher.onDidDelete;
        this.disposables.push(fsWatcher);
    }

    dispose(): void {
        this.disposables = dispose(this.disposables);
    }
}
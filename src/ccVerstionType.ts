export const enum CCVersionState {
    versioned,
    hijacked,
    untracked
}

export class CCVersionType {
    private mVersion = "";
    private mState = CCVersionState.untracked;

    constructor(version?: string, state?: CCVersionState) {
        this.mVersion = version ?? "";
        this.mState = state ?? CCVersionState.untracked;
    }

    set state(value: CCVersionState) {
        this.mState = value;
    }
    get state(): CCVersionState {
        return this.mState;
    }

    set version(value: string) {
        this.mVersion = value;
    }
    get version(): string {
        return this.mVersion;
    }
}
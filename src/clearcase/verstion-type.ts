export const enum CCVersionState {
  Versioned,
  Hijacked,
  Untracked,
}

export class VersionType {
  private mVersion = "";
  private mState = CCVersionState.Untracked;

  constructor(version?: string, state?: CCVersionState) {
    this.mVersion = version ?? "";
    this.mState = state ?? CCVersionState.Untracked;
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

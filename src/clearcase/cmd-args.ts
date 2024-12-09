export default class CmdArgs {
  public params: string[] = [];
  private mFiles: string[] = [];
  private mVersion: string | undefined;

  constructor(params: string[], file?: string[], version?: string) {
    this.params = [...params];
    if (file && file.length > 0) {
      this.mFiles = [...file];
    }
    this.mVersion = version;
  }

  private toString(): string {
    return this.params.reduce((a: string, s: string) => `${a} ${s}`) + ` ${this.mFiles}`;
  }

  getCmd(): string[] {
    if (this.mFiles !== undefined && this.mVersion === undefined) {
      return [...this.params, ...this.mFiles];
    } else if (this.mFiles !== undefined && this.mVersion !== undefined && this.mVersion !== "") {
      return [...this.params, `${this.mFiles[0]}@@${this.mVersion}`];
    }
    return this.params;
  }

  get files(): string[] {
    return this.mFiles;
  }

  set files(v: string[]) {
    this.mFiles = [...v];
  }

  set file(v: string) {
    this.mFiles.push(v);
  }
}

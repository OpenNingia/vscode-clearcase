import { ClearcaseCleartoolIf } from "./clearcase-cleartool-if";

export class ClearcaseCleartool implements ClearcaseCleartoolIf {
  private mUsername: string;
  private mPassword: string;
  private mAddress: string;
  private mExecutable: string;

  constructor(u = "", p = "", a = "", e = "") {
    this.mAddress = a;
    this.mPassword = p;
    this.mUsername = u;
    this.mExecutable = "";
    if (e !== "") {
      this.executable(e);
    } else {
      this.executable("cleartool");
    }
  }

  executable(val?: string | undefined): string {
    if (val !== undefined) {
      this.mExecutable = val;
    }
    return this.mExecutable;
  }

  credentials(): string[] {
    if (this.mAddress !== "") {
      return ["-lname", this.mUsername, "-password", this.mPassword, "-server", this.mAddress];
    }
    return [];
  }
}

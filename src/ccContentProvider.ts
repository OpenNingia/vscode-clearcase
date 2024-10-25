import {
  workspace,
  Uri,
  TextDocumentContentProvider,
  QuickDiffProvider,
  CancellationToken,
  ProviderResult,
} from "vscode";
import { ClearCase } from "./clearcase";
import { IDisposable } from "./model";
import { toCcUri, fromCcUri } from "./uri";
import { CCVersionState, CCVersionType } from "./ccVerstionType";

export class CCContentProvider implements TextDocumentContentProvider, QuickDiffProvider, IDisposable {
  private mDisposals: IDisposable[] = [];
  private mOriginalContent = "";
  private mOriginalPath = "";
  private mOriginalVersion: CCVersionType = new CCVersionType();

  constructor(private mCcHandler: ClearCase | null) {
    if (this.mCcHandler !== null) {
      this.mDisposals.push(workspace.registerTextDocumentContentProvider("cc", this));
      this.mDisposals.push(workspace.registerTextDocumentContentProvider("cc-orig", this));
    }
  }

  provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
    return this.getTextDocumentContent(uri, token);
  }

  private async getTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string> {
    if (token.isCancellationRequested === true) {
      return "canceled";
    }

    if (uri.scheme === "cc-orig") {
      uri = uri.with({ scheme: "cc", path: uri.query });
    }

    const { path, version } = fromCcUri(uri);

    try {
      // if the path did not change use the cached content
      let cnt = "";
      if (this.mOriginalPath === "" || this.mOriginalContent === "" || this.mOriginalPath !== uri.fsPath) {
        this.mOriginalContent = cnt = this.mCcHandler ? await this.mCcHandler.readFileAtVersion(path, version) : "";
      }
      return cnt;
    } catch (err) {
      console.log(err);
    }

    return "";
  }

  provideOriginalResource(uri: Uri, token: CancellationToken): ProviderResult<Uri> {
    return this.getOriginalResource(uri, token);
  }

  async getOriginalResource(uri: Uri, token?: CancellationToken): Promise<Uri | undefined> {
    if (token?.isCancellationRequested === true) {
      return undefined;
    }

    if (uri.scheme !== "file") {
      return;
    }
    let currentVersion = this.mOriginalVersion;
    if (this.mOriginalPath !== uri.fsPath) {
      currentVersion = (await this.mCcHandler?.getVersionInformation(uri, false)) ?? new CCVersionType();
      this.mOriginalVersion = currentVersion;
      this.mOriginalPath = uri.fsPath;
    }
    if (currentVersion) {
      const isCheckedOut = currentVersion.version.match(/(checkedout)$/i);

      if (isCheckedOut) {
        return toCcUri(uri, currentVersion.version.replace(/(CHECKEDOUT)$/i, "LATEST"));
      }
      if (currentVersion.state === CCVersionState.hijacked) {
        return toCcUri(uri, currentVersion.version);
      }
    }
    return;
  }

  public resetCache(): void {
    this.mOriginalPath = "";
    this.mOriginalContent = "";
    this.mOriginalVersion = new CCVersionType();
  }

  dispose(): void {
    this.mDisposals.forEach((d) => d.dispose());
  }
}

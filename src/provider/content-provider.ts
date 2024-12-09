import {
  workspace,
  Uri,
  TextDocumentContentProvider,
  QuickDiffProvider,
  CancellationToken,
  ProviderResult,
} from "vscode";
import { IDisposable } from "../model";
import { toCcUri, fromCcUri } from "../uri";
import { CCVersionState, VersionType } from "../clearcase/verstion-type";
import { Clearcase } from "../clearcase/clearcase";

export class ContentProvider implements TextDocumentContentProvider, QuickDiffProvider, IDisposable {
  private mDisposals: IDisposable[] = [];
  private mOriginalContent = "";
  private mOriginalPath = "";
  private mOriginalVersion: VersionType = new VersionType();

  constructor(private mCcHandler: Clearcase | null) {
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
    // explicit selected version to compare to
    if (uri.fragment !== "") {
      return toCcUri(uri, uri.fragment);
    }
    let currentVersion = this.mOriginalVersion;
    if (this.mOriginalPath !== uri.fsPath) {
      currentVersion = (await this.mCcHandler?.getVersionInformation(uri, false)) ?? new VersionType();
      this.mOriginalVersion = currentVersion;
      this.mOriginalPath = uri.fsPath;
    }
    if (currentVersion) {
      const isCheckedOut = currentVersion.version.match(/(checkedout)$/i);

      if (isCheckedOut) {
        const version =
          (await this.mCcHandler?.getFilePredecessorVersion(uri.fsPath)) ??
          new VersionType(currentVersion.version.replace(/(CHECKEDOUT)$/i, "LATEST"));
        return toCcUri(uri, version.version);
      }
      if (currentVersion.state === CCVersionState.Hijacked) {
        return toCcUri(uri, currentVersion.version);
      }
    }
    return;
  }

  public resetCache(): void {
    this.mOriginalPath = "";
    this.mOriginalContent = "";
    this.mOriginalVersion = new VersionType();
  }

  dispose(): void {
    this.mDisposals.forEach((d) => d.dispose());
  }
}

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

export class CCContentProvider implements TextDocumentContentProvider, QuickDiffProvider, IDisposable {
  private mDisposals: IDisposable[] = [];

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
      return this.mCcHandler ? await this.mCcHandler.readFileAtVersion(path, version) : "";
    } catch (err) {
      // no-op
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

    const currentVersion = (await this.mCcHandler?.getVersionInformation(uri, false)) ?? "";
    if (currentVersion !== "") {
      const isCheckedOut = currentVersion.match("\\b(CHECKEDOUT)\\b$");

      if (isCheckedOut) {
        return toCcUri(uri, currentVersion.replace("CHECKEDOUT", "LATEST"));
      }
    }
    return;
  }

  dispose(): void {
    this.mDisposals.forEach((d) => d.dispose());
  }
}

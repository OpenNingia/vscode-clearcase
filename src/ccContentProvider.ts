import { workspace, Uri, Disposable, TextDocumentContentProvider, QuickDiffProvider, CancellationToken } from "vscode";
import { ClearCase } from "./clearcase";
import { toCcUri, fromCcUri } from "./uri";

export class CCContentProvider implements TextDocumentContentProvider, QuickDiffProvider, Disposable {
  constructor(private mCcHandler: ClearCase | null, private mDisposals: Disposable[]) {
    if (this.mCcHandler !== null) {
      this.mDisposals.push(workspace.registerTextDocumentContentProvider("cc", this));
      this.mDisposals.push(workspace.registerTextDocumentContentProvider("cc-orig", this));
    }
  }

  async provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string> {
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

  async provideOriginalResource(uri: Uri): Promise<Uri | undefined> {
    if (uri.scheme !== "file") {
      return;
    }

    const currentVersion = this.mCcHandler ? await this.mCcHandler.getVersionInformation(uri, false) : "";
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

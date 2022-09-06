import { CancellationToken, CodeLens, CodeLensProvider, ProviderResult, Range, TextDocument } from "vscode";
import { CCAnnotateLens } from "./ccAnnotateLens";
import { CCConfigHandler } from "./ccConfigHandler";
import { CCScmProvider } from "./ccScmProvider";

export class CCCodeLensProvider implements CodeLensProvider {
  static selector = {
    scheme: "file",
  };

  constructor(
    private mCfg: CCConfigHandler,
    private mProvider: CCScmProvider
  ) { }

  provideCodeLenses(document: TextDocument, token: CancellationToken): ProviderResult<CodeLens[]> {
    if (!this.mCfg.configuration.showAnnotationCodeLens.value) {
      return [];
    }

    return this.getCodeLenses(document, token);
  }

  private async getCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
    if (token.isCancellationRequested === true) {
      return [];
    }

    const isClearcaseObject = (await this.mProvider.clearCase?.isClearcaseObject(document.uri)) ?? false;

    if (document !== undefined && isClearcaseObject) {
      return [new CCAnnotateLens(document, new Range(0, 0, 0, 1))];
    }
    return [];
  }

  resolveCodeLens?(codeLens: CodeLens, token: CancellationToken): ProviderResult<CodeLens> {
    if (token.isCancellationRequested === true) {
      return codeLens;
    }

    if (codeLens instanceof CCAnnotateLens) {
      codeLens.command = {
        title: "Toggle annotations",
        command: "extension.ccAnnotate",
        arguments: [codeLens.document.uri],
      };
      return codeLens;
    }

    return Promise.reject();
  }
}

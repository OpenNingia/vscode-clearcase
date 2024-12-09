import { CancellationToken, CodeLens, CodeLensProvider, ProviderResult, Range, TextDocument } from "vscode";
import { AnnotationLens } from "../annotation/annotation-lens";
import { ClearcaseScmProvider } from "./clearcase-scm-provider";
import { ConfigurationHandler } from "../configuration/configuration-handler";

export class AnnotationLensProvider implements CodeLensProvider {
  static selector = {
    scheme: "file",
  };

  constructor(private mCfg: ConfigurationHandler, private mProvider: ClearcaseScmProvider) {}

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

    const isClearcaseObject = (await this.mProvider.clearcase?.isClearcaseObject(document.uri)) ?? false;

    if (document !== undefined && isClearcaseObject) {
      return [new AnnotationLens(document, new Range(0, 0, 0, 1))];
    }
    return [];
  }

  resolveCodeLens?(codeLens: CodeLens, token: CancellationToken): ProviderResult<CodeLens> {
    if (token.isCancellationRequested === true) {
      return codeLens;
    }

    if (codeLens instanceof AnnotationLens) {
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

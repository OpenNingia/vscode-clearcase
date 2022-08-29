import { CancellationToken, CodeLens, CodeLensProvider, ExtensionContext, Range, TextDocument } from "vscode";
import { CCAnnotateLens } from "./ccAnnotateLens";
import { CCConfigHandler } from "./ccConfigHandler";
import { CCScmProvider } from "./ccScmProvider";

export class CCCodeLensProvider implements CodeLensProvider {
  static selector = {
    scheme: "file",
  };

  public constructor(
    private mContext: ExtensionContext,
    private mCfg: CCConfigHandler,
    private mProvider: CCScmProvider
  ) {}

  public provideCodeLenses(document: TextDocument, token: CancellationToken): Thenable<CodeLens[]> | CodeLens[] {
    if (!this.mCfg.configuration.showAnnotationCodeLens.value) {
      return [];
    }

    const lLenses: CodeLens[] = [];
    return new Promise((resolve) => {
      this.mProvider.clearCase?.isClearcaseObject(document.uri).then((is: boolean) => {
        if (document !== undefined && is === true) {
          lLenses.push(new CCAnnotateLens(document, new Range(0, 0, 0, 1)));
        }
        resolve(lLenses);
      });
    });
  }

  public resolveCodeLens(codeLens: CodeLens, token: CancellationToken): Thenable<CodeLens> {
    if (codeLens instanceof CCAnnotateLens) {
      return this.ccAnnotationCommand(codeLens, token);
    }

    return Promise.reject<CodeLens>(undefined);
  }

  private ccAnnotationCommand(iLens: CCAnnotateLens, iToken: CancellationToken) {
    iLens.command = {
      title: "Toggle annotations",
      command: "extension.ccAnnotate",
      arguments: [iLens.document.uri],
    };
    return Promise.resolve(iLens);
  }
}

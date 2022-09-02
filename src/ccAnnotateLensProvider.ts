import { CodeLens, CodeLensProvider, ExtensionContext, Range, TextDocument } from "vscode";
import { CCAnnotateLens } from "./ccAnnotateLens";
import { CCConfigHandler } from "./ccConfigHandler";
import { CCScmProvider } from "./ccScmProvider";

export class CCCodeLensProvider implements CodeLensProvider {
  static selector = {
    scheme: "file",
  };

  constructor(
    private mContext: ExtensionContext,
    private mCfg: CCConfigHandler,
    private mProvider: CCScmProvider
  ) { }

  provideCodeLenses(document: TextDocument): Thenable<CodeLens[]> | CodeLens[] {
    if (!this.mCfg.configuration.showAnnotationCodeLens.value) {
      return [];
    }

    return new Promise((resolve) => {
      this.mProvider.clearCase?.isClearcaseObject(document.uri).then((is: boolean) => {
        const lLenses: CodeLens[] = [];
        if (document !== undefined && is === true) {
          lLenses.push(new CCAnnotateLens(document, new Range(0, 0, 0, 1)));
        }
        resolve(lLenses);
      });
    });
  }

  resolveCodeLens(codeLens: CodeLens): Thenable<CodeLens> {
    if (codeLens instanceof CCAnnotateLens) {
      codeLens.command = {
        title: "Toggle annotations",
        command: "extension.ccAnnotate",
        arguments: [codeLens.document.uri],
      };
      return Promise.resolve(codeLens);
    }

    return Promise.reject();
  }
}

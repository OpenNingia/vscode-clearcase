import {
  DecorationOptions,
  DecorationRenderOptions,
  ExtensionContext,
  Range,
  TextEditor,
  TextEditorDecorationType,
  window,
} from "vscode";
import { CCConfigHandler } from "./ccConfigHandler";
import { CCConfiguration } from "./ccConfiguration";

export class CCAnnotationController {
  private mDecorationType: TextEditorDecorationType;
  private mIsActive: boolean;
  private mConfiguration: CCConfiguration;

  constructor(private editor: TextEditor, private context: ExtensionContext, private configHandler: CCConfigHandler) {
    this.mIsActive = false;
    window.onDidChangeActiveTextEditor((editor) => this.onActiveEditorChange(editor), this, this.context.subscriptions);
    this.configHandler.onDidChangeConfiguration(() => this.onConfigurationChanged());
    const ro: DecorationRenderOptions = {
      isWholeLine: false,
      before: {
        margin: "0 1em 0 0",
      },
      after: {
        margin: "0 0 0 1em",
      },
    };
    this.mDecorationType = window.createTextEditorDecorationType(ro);
    this.mConfiguration = this.configHandler.configuration;
  }

  private onActiveEditorChange(editor: TextEditor | undefined): void {
    if (editor) {
      this.mIsActive = false;
      this.editor = editor;
    }
  }

  private onConfigurationChanged() {
    this.mConfiguration = this.configHandler.configuration;
  }

  setAnnotationInText(annotationText: string): void {
    let deco: DecorationOptions[] = [];
    let maxWidth = 0;
    if (this.mIsActive === false) {
      const textLines = annotationText.split(/[\n\r]+/);
      const textLineParts = textLines.map((l) => {
        const parts = l.split(" | ");
        parts[0] = parts[0].replace(/\\/g, "/");
        if (parts[0].length > maxWidth) {
          maxWidth = parts[0].length;
        }
        return parts;
      });
      deco = this.getDecoration(textLineParts, maxWidth);
      this.mIsActive = true;
    } else {
      this.mIsActive = false;
    }
    this.editor.setDecorations(this.mDecorationType, deco);
  }

  private getDecoration(iLines: string[][], iMaxWidth: number): DecorationOptions[] {
    const deco: DecorationOptions[] = [];
    for (let lineNr = 0; lineNr < iLines.length; lineNr++) {
      let line = iLines[lineNr][0].replace(/ /gi, "\u00A0");
      while (line.length < iMaxWidth) {
        line = line.concat("\u00A0");
      }
      deco.push(this.createLineDecoration(line, lineNr, 0));
    }
    return deco;
  }

  private createLineDecoration(iLinePart: string, iLineNr: number, iCharStart: number): DecorationOptions {
    const charLen = iLinePart.length;
    let range = window.activeTextEditor?.document.validateRange(new Range(iLineNr, iCharStart, iLineNr, charLen));
    if (range === undefined) {
      range = new Range(0, 0, 0, 0);
    }
    return {
      hoverMessage: "",
      range: range,
      renderOptions: {
        before: {
          color: this.mConfiguration.annotationColor.value,
          backgroundColor: this.mConfiguration.annotationBackground.value,
          contentText: iLinePart,
        },
      },
    };
  }

  dispose(): void {
    // do nothing.
  }
}

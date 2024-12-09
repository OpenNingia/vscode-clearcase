import {
  DecorationOptions,
  DecorationRenderOptions,
  Range,
  TextEditor,
  TextEditorDecorationType,
  window,
} from "vscode";
import { IDisposable } from "../model";
import { Configuration } from "../configuration/configuration";
import { ConfigurationHandler } from "../configuration/configuration-handler";

export class AnnotationController implements IDisposable {
  private mDecorationType: TextEditorDecorationType;
  private mIsActive = false;
  private mConfiguration: Configuration;
  private mDisposables: IDisposable[] = [];

  constructor(private editor: TextEditor, private configHandler: ConfigurationHandler) {
    this.mDisposables.push(window.onDidChangeActiveTextEditor((editor) => this.onActiveEditorChange(editor)));
    this.mDisposables.push(this.configHandler.onDidChangeConfiguration(() => this.onConfigurationChanged()));
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

import { CodeLens, Range, TextDocument } from "vscode";

export class AnnotationLens extends CodeLens {
  constructor(public document: TextDocument, range: Range) {
    super(range);
  }
}

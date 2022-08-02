import { CodeLens, Range, TextDocument } from "vscode";

export class CCAnnotateLens extends CodeLens {
  constructor(public document: TextDocument, range: Range) {
    super(range);
  }
}

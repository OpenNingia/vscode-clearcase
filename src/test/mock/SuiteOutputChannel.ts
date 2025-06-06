import { OutputChannel, ViewColumn } from "vscode";

export default class SuiteOutputChannel implements OutputChannel {
  content: string[];
  name: string;

  public constructor(name: string) {
    this.content = [];
    this.name = name;
    this.clear();
  }

  append(value: string): void {
    this.content.push(value);
  }
  appendLine(value: string): void {
    this.content.push(`${value.trim()}\n`);
  }
  replace(value: string): void {
    this.clear();
    this.content.push(value);
  }
  clear(): void {
    this.content = [];
  }
  show(column?: ViewColumn | boolean, preserveFocus?: boolean): void {
    preserveFocus = true;
    if (typeof column === "boolean") {
      column = false;
    }
    if (preserveFocus) {
      column = 1;
    }
    return;
  }
  hide(): void {
    return;
  }
  dispose(): void {
    return;
  }

  getValue(): string {
    return this.content.join("; ");
  }

  getLine(nr: number): string {
    const len = this.content.length;
    if (nr > len) {
      nr = len > 0 ? len - 1 : 0;
    }
    return this.content[nr];
  }

  getLastLine(): string {
    const len = this.content.length;
    if (len === 0) {
      return "";
    } else {
      return this.content[len - 1];
    }
  }

  getLineCount(): number {
    return this.content.length;
  }
}

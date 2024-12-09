import { OutputChannel } from "vscode";

export enum LogLevel {
  Trace,
  Debug,
  Information,
  Warning,
  Error,
  Critical,
  None,
}

export default class CcOutputChannel implements OutputChannel {
  name: string;
  debug: LogLevel = LogLevel.None;

  constructor(private outputChannelBase: OutputChannel) {
    this.name = outputChannelBase.name;
  }

  append(value: string, level?: LogLevel): void {
    if (level !== undefined && this.debug <= level) {
      this.outputChannelBase.append(value);
    }
  }
  appendLine(value: string, level?: LogLevel): void {
    if (level !== undefined && this.debug <= level) {
      this.outputChannelBase.appendLine(value);
    }
  }
  replace(value: string): void {
    if (this.debug) {
      this.outputChannelBase.replace(value);
    }
  }
  clear(): void {
    this.outputChannelBase.clear();
  }
  show(column?: unknown, preserveFocus?: boolean): void {
    this.outputChannelBase.show(preserveFocus);
  }
  hide(): void {
    this.outputChannelBase.hide();
  }
  dispose(): void {
    this.outputChannelBase.dispose();
  }

  set logLevel(value: LogLevel) {
    this.debug = value;
  }

  get logLevel(): LogLevel {
    return this.debug;
  }
}

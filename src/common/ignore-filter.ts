import ignore from "ignore";
import * as fs from "fs";
import * as path from "path";
import CcOutputChannel, { LogLevel } from "../ui/output-channel";

export class IgnoreFilter {
  private mIg = ignore({ ignorecase: true });
  private mRoot = "";

  constructor(ignoreFile: string, private mOutputChannel: CcOutputChannel) {
    if (fs.existsSync(ignoreFile)) {
      this.mIg.add(fs.readFileSync(ignoreFile).toString());
    }
  }

  start(startPath: string): string[] {
    this.mRoot = startPath;
    if (fs.existsSync(startPath)) {
      return this.traverse(startPath);
    }
    return [];
  }

  traverse(startPath: string): string[] {
    const files = fs.readdirSync(startPath);
    this.mIg.filter(files);
    let filtered: string[] = [];
    for (const file of files) {
      try {
        const f = path.join(startPath, file);
        const stat = fs.statSync(f);
        if (stat.isDirectory()) {
          filtered = [...filtered, ...this.traverse(f)];
        } else {
          if (!this.mIg.ignores(path.relative(this.mRoot, f))) {
            filtered.push(f);
          }
        }
      } catch (err) {
        this.mOutputChannel.appendLine(`Error stat ${err}`, LogLevel.Debug);
      }
    }
    return filtered;
  }
}

import { SourceControlResourceState, Uri, ThemeColor, SourceControlResourceDecorations, Command } from "vscode";
import { CCScmStatus } from "./ccScmStatus";
import * as path from "path";

export const enum ResourceGroupType {
  Merge,
  Index,
  WorkingTree,
  Untracked,
  Hijacked,
}

const iconRootPath = path.join(path.dirname(__dirname), "Assets", "icons");
function getIconUri(iconName: string, theme: string) {
  return Uri.file(path.join(iconRootPath, theme, `${iconName}.svg`));
}

export class CCScmResource implements SourceControlResourceState {
  get resourceUri(): Uri {
    return this.mResourceUri;
  }

  get command(): Command {
    return {
      command: "extension.ccEmbedDiff",
      title: "compare to previous",
      arguments: [this.resourceUri],
    };
  }

  constructor(private mResourceGrpType: ResourceGroupType, private mResourceUri: Uri, private mType: CCScmStatus) {}

  get type(): CCScmStatus {
    return this.mType;
  }

  get letter(): string {
    switch (this.type) {
      case CCScmStatus.Modified:
        return "M";
      case CCScmStatus.Untracked:
        return "U";
      case CCScmStatus.Hijacked:
        return "H";
    }
  }

  get tooltip(): string {
    switch (this.type) {
      case CCScmStatus.Modified:
        return "modified";
      case CCScmStatus.Untracked:
        return "untracked";
      case CCScmStatus.Hijacked:
        return "hijacked";
    }
  }

  get color(): ThemeColor {
    switch (this.type) {
      case CCScmStatus.Modified:
        return new ThemeColor("ccDecoration.modifiedResourceForeground");
      case CCScmStatus.Untracked:
        return new ThemeColor("ccDecoration.untrackedResourceForeground");
      case CCScmStatus.Hijacked:
        return new ThemeColor("ccDecoration.hijackedResourceForeground");
    }
  }

  get decorations(): SourceControlResourceDecorations {
    const faded = false;
    const strikeThrough = false;
    const tooltip = this.tooltip;
    const dark = { iconPath: getIconUri("status-modified", "dark") };
    const light = { iconPath: getIconUri("status-modified", "light") };
    return { strikeThrough, faded, tooltip, light, dark };
  }

  static sort(a: SourceControlResourceState, b: SourceControlResourceState): 1 | -1 | 0 {
    if (a.resourceUri.fsPath < b.resourceUri.fsPath) {
      return -1;
    }
    if (a.resourceUri.fsPath > b.resourceUri.fsPath) {
      return 1;
    }
    return 0;
  }
}

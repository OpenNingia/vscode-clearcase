import { SourceControlResourceState, Uri, ThemeColor, SourceControlResourceDecorations, Command } from "vscode";
import { ScmStatus } from "./scm-status";
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

export class ScmResource implements SourceControlResourceState {
  get resourceUri(): Uri {
    return this.mResourceUri;
  }

  get command(): Command {
    if (this.type === ScmStatus.Untracked) {
      return { command: "extension.ccOpenResource", title: "Open view private file", arguments: [this.resourceUri] };
    } else {
      return {
        command: "extension.ccEmbedDiff",
        title: "compare to previous",
        arguments: [this.resourceUri],
      };
    }
  }

  constructor(private mResourceGrpType: ResourceGroupType, private mResourceUri: Uri, private mType: ScmStatus) {}

  get type(): ScmStatus {
    return this.mType;
  }

  get letter(): string {
    switch (this.type) {
      case ScmStatus.Modified:
        return "M";
      case ScmStatus.Untracked:
        return "U";
      case ScmStatus.Hijacked:
        return "H";
    }
  }

  get tooltip(): string {
    switch (this.type) {
      case ScmStatus.Modified:
        return "modified";
      case ScmStatus.Untracked:
        return "untracked";
      case ScmStatus.Hijacked:
        return "hijacked";
    }
  }

  get color(): ThemeColor {
    switch (this.type) {
      case ScmStatus.Modified:
        return new ThemeColor("ccDecoration.modifiedResourceForeground");
      case ScmStatus.Untracked:
        return new ThemeColor("ccDecoration.untrackedResourceForeground");
      case ScmStatus.Hijacked:
        return new ThemeColor("ccDecoration.hijackedResourceForeground");
    }
  }

  get decorations(): SourceControlResourceDecorations {
    const faded = false;
    const strikeThrough = false;
    const tooltip = this.tooltip;
    const dark = { iconPath: this.getIcon("dark") };
    const light = { iconPath: this.getIcon("light") };
    return { strikeThrough, faded, tooltip, light, dark };
  }

  private getIcon(theme: string) {
    switch (theme) {
      case "dark":
      case "light":
        switch (this.mType) {
          case ScmStatus.Untracked:
            return getIconUri("status-untracked", theme);
          case ScmStatus.Modified:
            return getIconUri("status-modified", theme);
          case ScmStatus.Hijacked:
            return getIconUri("status-hijacked", theme);
        }
        break;

      default:
        break;
    }
    return Uri.file("");
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

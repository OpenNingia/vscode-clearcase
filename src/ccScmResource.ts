import { SourceControlResourceState, Uri, ThemeColor, SourceControlResourceDecorations, Command, SourceControlResourceThemableDecorations } from "vscode";
import { CCScmStatus } from "./ccScmStatus";
import * as path from 'path';

export const enum ResourceGroupType {
	merge,
	index,
	workingTree,
	untracked
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
			command: 'extension.ccEmbedDiff',
			title: "compare to previous",
			arguments: [this.resourceUri]
		};
	}

	constructor(
		private mResourceGrpType: ResourceGroupType,
		private mResourceUri: Uri,
		private mType: CCScmStatus) {
	}

	get type(): CCScmStatus { return this.mType; }

	get letter(): string {
		switch (this.type) {
			case CCScmStatus.modified: return 'M';
			case CCScmStatus.untracked: return 'U';
		}
	}

	get tooltip(): string {
		switch (this.type) {
			case CCScmStatus.modified: return 'modified';
			case CCScmStatus.untracked: return 'untracked';
		}
	}

	get color(): ThemeColor {
		switch (this.type) {
			case CCScmStatus.modified:
				return new ThemeColor('ccDecoration.modifiedResourceForeground');
			case CCScmStatus.untracked:
				return new ThemeColor('ccDecoration.untrackedResourceForeground');
		}
	}

	get decorations(): SourceControlResourceDecorations {
		const faded = false;
		const strikeThrough = false;
		const tooltip = this.tooltip;
		const dark = {iconPath: getIconUri("status-modified", "dark")};
		const light = {iconPath: getIconUri("status-modified", "light")};
		return { strikeThrough, faded, tooltip, light, dark };
	}

	public static sort( a:CCScmResource, b:CCScmResource)
	{
		if( a.resourceUri.fsPath < b.resourceUri.fsPath ) {
			return -1;
		}
		if( a.resourceUri.fsPath > b.resourceUri.fsPath ) {
			return 1;
		}
		return 0;
	}

}

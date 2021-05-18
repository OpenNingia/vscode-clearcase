import { SourceControlResourceState, Uri, ThemeColor, SourceControlResourceDecorations, Command, SourceControlResourceThemableDecorations } from "vscode";
import { CCScmStatus } from "./ccScmStatus";


export const enum ResourceGroupType {
	merge,
	index,
	workingTree,
	untracked
}

class CCScmResourceThemableDecorations implements SourceControlResourceThemableDecorations {
	iconPath: string = "";
}

class CCScmResourceDecorations implements SourceControlResourceDecorations {
	strikeThrough: boolean = false;
	faded: boolean = false;
	tooltip: string = "";
	light: SourceControlResourceThemableDecorations = new CCScmResourceThemableDecorations();
	dark: SourceControlResourceThemableDecorations = new CCScmResourceThemableDecorations();
}


export class CCScmResource implements SourceControlResourceState {

	private decor: CCScmResourceDecorations;

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
		this.decor = new CCScmResourceDecorations();
		this.decor.tooltip = this.tooltip;
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
			case CCScmStatus.modified: return new ThemeColor('ccDecoration.modifiedResourceForeground');
			case CCScmStatus.untracked: return new ThemeColor('ccDecoration.untrackedResourceForeground');
		}
	}

	get decorations(): CCScmResourceDecorations {
		return this.decor;
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

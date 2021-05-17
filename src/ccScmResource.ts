import { SourceControlResourceState, Uri, ThemeColor, SourceControlResourceDecorations, Command, SourceControlResourceThemableDecorations } from "vscode";
import { ccScmStatus } from "./ccScmStatus";


export const enum ResourceGroupType {
	Merge,
	Index,
	WorkingTree,
	Untracked
}

class ccScmResourceThemableDecorations implements SourceControlResourceThemableDecorations {
	iconPath: string = "";
}

class ccScmResourceDecorations implements SourceControlResourceDecorations {
	strikeThrough: boolean = false;
	faded: boolean = false;
	tooltip: string = "";
	light: SourceControlResourceThemableDecorations = new ccScmResourceThemableDecorations();
	dark: SourceControlResourceThemableDecorations = new ccScmResourceThemableDecorations();
}


export class ccScmResource implements SourceControlResourceState {

	private decor: ccScmResourceDecorations;

	get resourceUri(): Uri {
		return this.m_resourceUri;
	}

	get command(): Command {
		return {
			command: 'extension.ccEmbedDiff',
			title: "compare to previous",
			arguments: [this.resourceUri]
		};
	}

	constructor(
		private m_resourceGrpType: ResourceGroupType,
		private m_resourceUri: Uri,
		private m_type: ccScmStatus) {
		this.decor = new ccScmResourceDecorations();
		this.decor.tooltip = this.tooltip;
	}

	get type(): ccScmStatus { return this.m_type; }

	get letter(): string {
		switch (this.type) {
			case ccScmStatus.MODIFIED: return 'M';
			case ccScmStatus.UNTRACKED: return 'U';
		}
	}

	get tooltip(): string {
		switch (this.type) {
			case ccScmStatus.MODIFIED: return 'modified';
			case ccScmStatus.UNTRACKED: return 'untracked';
		}
	}

	get color(): ThemeColor {
		switch (this.type) {
			case ccScmStatus.MODIFIED: return new ThemeColor('ccDecoration.modifiedResourceForeground');
			case ccScmStatus.UNTRACKED: return new ThemeColor('ccDecoration.untrackedResourceForeground');
		}
	}

	get decorations(): ccScmResourceDecorations {
		return this.decor;
	}

	public static sort( a:ccScmResource, b:ccScmResource)
	{
		if( a.resourceUri.fsPath < b.resourceUri.fsPath )
			return -1;
		if( a.resourceUri.fsPath > b.resourceUri.fsPath )
			return 1;
		return 0;
	}

}

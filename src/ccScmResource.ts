import { SourceControlResourceState, Uri, ThemeColor, SourceControlResourceDecorations, Command } from "vscode";
import { ccScmStatus } from "./ccScmStatus";


export const enum ResourceGroupType {
	Merge,
	Index,
	WorkingTree,
	Untracked
}


export class ccScmResource implements SourceControlResourceState {

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
		private m_type: ccScmStatus) {}

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

	get decorations(): SourceControlResourceDecorations {
		const light = undefined;
		const dark = undefined;
		const tooltip = this.tooltip;
		const strikeThrough = undefined;
		const faded = false;
		const letter = this.letter;
		const color = this.color;

		return { strikeThrough, faded, tooltip, light, dark};
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

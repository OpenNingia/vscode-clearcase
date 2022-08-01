

import { workspace, Uri, Disposable, TextDocumentContentProvider, QuickDiffProvider, CancellationToken } from 'vscode';
import { ClearCase } from "./clearcase";
import { toCcUri, fromCcUri } from "./uri";

export class CCContentProvider implements TextDocumentContentProvider, QuickDiffProvider, Disposable {

	private mCcHandler: ClearCase|null = null;

	constructor(private cc: ClearCase|null, private m_disposals: Disposable[]) {
		if(cc!==null) {
			this.mCcHandler = cc;
			this.m_disposals.push(
				workspace.registerTextDocumentContentProvider('cc-file-current', this),
				workspace.registerTextDocumentContentProvider('cc-file-org', this)
			);
		}
	}
	
	async provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string> {

		if( token.isCancellationRequested === true ) {
			return "canceled";
		}

		if (uri.scheme === 'cc-file-org') {
			uri = uri.with({ scheme: 'cc-file-current', path: uri.query });
		}

		let { path, version } = fromCcUri(uri);


		try {
			return this.mCcHandler ? await this.mCcHandler.readFileAtVersion(path, version) : '';
		}
		catch (err) {
			// no-op
		}

		return '';
	}

	async provideOriginalResource(uri: Uri): Promise<Uri | undefined> {
		if (uri.scheme !== "file") {
			return;
		}

		let currentVersion = this.mCcHandler ? await this.mCcHandler.getVersionInformation(uri, false) : '';
		if( currentVersion !== "" ) {
			let isCheckedOut = currentVersion.match("\\b(CHECKEDOUT)\\b$");

			if (isCheckedOut) {
				return toCcUri(uri, currentVersion.replace("CHECKEDOUT", "LATEST"));
			}
		}
		return;
	}

	dispose(): void {
		this.m_disposals.forEach(d => d.dispose());
	}
}
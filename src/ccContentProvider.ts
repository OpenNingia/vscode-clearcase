

import { workspace, Uri, Disposable, TextDocumentContentProvider, QuickDiffProvider } from 'vscode';
import { ClearCase } from "./clearcase";
import { toCcUri, fromCcUri } from "./uri";

export class CCContentProvider implements TextDocumentContentProvider, QuickDiffProvider {

	private mCcHandler: ClearCase|null = null;
	private disposables: Disposable[] = [];

	constructor(private cc: ClearCase|null) {
		if(cc!==null) {
			this.mCcHandler = cc;
			this.disposables.push(
				workspace.registerTextDocumentContentProvider('cc', this),
				workspace.registerTextDocumentContentProvider('cc-orig', this)
			);
		}
	}
	
	async provideTextDocumentContent(uri: Uri): Promise<string> {

		if (uri.scheme === 'cc-orig') {
			uri = uri.with({ scheme: 'cc', path: uri.query });
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
		this.disposables.forEach(d => d.dispose());
	}
}
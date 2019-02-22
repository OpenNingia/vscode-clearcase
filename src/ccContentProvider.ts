

import { workspace, Uri, Disposable, TextDocumentContentProvider, QuickDiffProvider } from 'vscode';
import { ClearCase } from "./clearcase";
import { toCcUri, fromCcUri } from "./uri";

export class ccContentProvider implements TextDocumentContentProvider, QuickDiffProvider {

	private m_ccHandler: ClearCase;
	private disposables: Disposable[] = [];

	constructor(private cc: ClearCase) {
        this.m_ccHandler = cc;
		this.disposables.push(
			workspace.registerTextDocumentContentProvider('cc', this),
			workspace.registerTextDocumentContentProvider('cc-orig', this)
		);
	}
	
	async provideTextDocumentContent(uri: Uri): Promise<string> {

		if (uri.scheme === 'cc-orig') {
			uri = uri.with({ scheme: 'cc', path: uri.query });
		}

        let { path, version } = fromCcUri(uri);
        

		try {
			return await this.m_ccHandler.readFileAtVersion(path, version);
		}
		catch (err) {
			// no-op
		}

		return '';
    }
    
    async provideOriginalResource(uri: Uri): Promise<Uri | undefined> {
        if (uri.scheme !== "file")
          return;

        let current_version = await this.m_ccHandler.getVersionInformation(uri, false);
        let is_checked_out = current_version.match("\\b(CHECKEDOUT)\\b$");
        
        if (is_checked_out)
          return toCcUri(uri, current_version.replace("CHECKEDOUT", "LATEST"));
        return;
      }    

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
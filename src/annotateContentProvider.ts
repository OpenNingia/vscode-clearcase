
'use strict';
import {ExtensionContext, TextDocumentContentProvider, Uri, window} from 'vscode';
import {ClearCase} from './clearcase';
import * as path from 'path';

export default class ClearcaseAnnotateContentProvider implements TextDocumentContentProvider {

    static scheme = 'cc-annotate';

    constructor(context: ExtensionContext, private cc: ClearCase) { }

    async provideTextDocumentContent(uri: Uri): Promise<string> {
        try {
            return await this.cc.getAnnotatedFileContent(uri.fsPath);
        }
        catch (ex) {
            await window.showErrorMessage("Unable to show clearcase annotation");
            return undefined;
        }
    }
}
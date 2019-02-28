'use strict';

import { Uri } from 'vscode';

export function fromCcUri(uri: Uri): { path: string; version: string } {
	return JSON.parse(uri.query);
}

export function toCcUri(uri: Uri, ver: string): Uri {
	return uri.with({
		scheme: 'cc-orig',
		path: uri.path,
		query: JSON.stringify({
            path: uri.fsPath,
            version: ver
		})
	});
}
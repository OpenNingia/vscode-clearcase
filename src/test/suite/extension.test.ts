import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { CCConfigHandler } from '../../ccConfigHandler';
import { CCScmProvider } from '../../ccScmProvider';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	let extensionContext: vscode.ExtensionContext;
	let outputChannel: vscode.OutputChannel;

	suiteSetup( async () => {
		await vscode.extensions.getExtension("vscode-clearcase")?.activate();
		/* eslint-disable */
		extensionContext = (global as any).testExtensionContext;
		/* eslint-enable */
	});

	test('Cleartool change executable', () => {
		const configHandler = new CCConfigHandler();
		configHandler.configuration.executable.value = "bin/cleartool.sh";
		assert.strictEqual(configHandler.configuration.executable.value, "bin/cleartool.sh");
	});

	test('Cleartool checkin file', () => {
		const configHandler = new CCConfigHandler();
		const provider = new CCScmProvider(extensionContext, outputChannel, configHandler);
		configHandler.configuration.executable.value = `bin/cleartool.sh`;

		const file = vscode.Uri.parse("testfiles/simple01.txt");
		provider.clearCase?.checkinFile([file]);
		assert.strictEqual("blubb", "checkin version");
	});
});

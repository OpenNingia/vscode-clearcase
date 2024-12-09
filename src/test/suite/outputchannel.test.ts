import * as assert from "assert";
import * as path from "path";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { ClearcaseScmProvider } from "../../provider/clearcase-scm-provider";
import { chmodSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "fs";
import { after, before, beforeEach } from "mocha";
import SuiteOutputChannel from "../mock/SuiteOutputChannel";
import CcOutputChannel, { LogLevel } from "../../ui/output-channel";
import { ConfigurationHandler } from "../../configuration/configuration-handler";
// import * as myExtension from '../../extension';

suite("Outputchannel Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");
  let extensionContext: vscode.ExtensionContext;
  let outputChannelBase: SuiteOutputChannel;
  let outputChannel: CcOutputChannel;
  let configHandler: ConfigurationHandler;
  let provider: ClearcaseScmProvider;
  let testDir: string;

  before(async () => {
    await vscode.extensions.getExtension("vscode-clearcase")?.activate();
    /* eslint-disable */
    extensionContext = (global as any).testExtensionContext;
    /* eslint-enable */
    outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    outputChannel = new CcOutputChannel(outputChannelBase);

    testDir = path.join(__dirname, "testfiles");
    try {
      mkdirSync(testDir);
      console.log(`Directory ${testDir} created`);
    } catch (e) {
      return console.error(e);
    }
    writeFileSync(path.join(testDir, "simple01.txt"), "");
    writeFileSync(path.join(testDir, "simple02.txt"), "");
    writeFileSync(path.join(testDir, "simple03.txt"), "");
    writeFileSync(path.join(testDir, "simple04.txt"), "");
    writeFileSync(path.join(testDir, "simple04_ro.txt"), "");
    chmodSync(path.join(testDir, "simple04_ro.txt"), 0o555);
  });

  after(() => {
    unlinkSync(path.join(testDir, "simple01.txt"));
    unlinkSync(path.join(testDir, "simple02.txt"));
    unlinkSync(path.join(testDir, "simple03.txt"));
    unlinkSync(path.join(testDir, "simple04.txt"));
    unlinkSync(path.join(testDir, "simple04_ro.txt"));
    rmdirSync(testDir);
  });

  beforeEach(async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";

    configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Trace;
    provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();
  });

  test("Cleartool checkin file - Loglevel=None", async () => {
    configHandler.configuration.useClearDlg.value = false;
    outputChannel.logLevel = LogLevel.None;
    configHandler.configuration.checkinCommand.value = "-nc ${filename}";

    const file = vscode.Uri.parse(path.resolve(__dirname, "testfiles/simple01.txt"));
    await provider.clearcase?.checkinFile([file]);
    assert.strictEqual(outputChannelBase.getLine(0), undefined);
  });

  test("Cleartool checkin file - Loglevel=Trace", async () => {
    configHandler.configuration.useClearDlg.value = false;
    outputChannel.logLevel = LogLevel.Trace;
    configHandler.configuration.checkinCommand.value = "-nc ${filename}";

    const file = vscode.Uri.parse(path.resolve(__dirname, "testfiles/simple01.txt"));
    await provider.clearcase?.checkinFile([file]);
    assert.strictEqual(outputChannelBase.getLine(0), `ci,-nc,${path.join(testDir, "simple01.txt")}\n`);
    assert.strictEqual(
      outputChannelBase.getLastLine(),
      `Checked in "${path.join(testDir, "simple01.txt")}" version "/main/dev_01/2".\n`
    );
  });

  test("Cleartool checkout file already checked out - LogLevel=Warning", async () => {
    configHandler.configuration.useClearDlg.value = false;
    outputChannel.logLevel = LogLevel.Critical;
    configHandler.configuration.checkoutCommand.value = "-nc ${filename}";

    const file = path.join(testDir, "simple04.txt");

    const fileUri = vscode.Uri.parse(file);
    await provider.clearcase?.checkoutFile([fileUri]);
    assert.strictEqual(outputChannelBase.getLine(0), undefined);
  });

  test("Cleartool checkout file already checked out - LogLevel=Error", async () => {
    configHandler.configuration.useClearDlg.value = false;
    outputChannel.logLevel = LogLevel.Error;
    configHandler.configuration.checkoutCommand.value = "-nc ${filename}";

    const file = path.join(testDir, "simple04.txt");

    const fileUri = vscode.Uri.parse(file);
    await provider.clearcase?.checkoutFile([fileUri]);
    assert.strictEqual(
      outputChannelBase.getLine(0),
      `exit code 0, stderr: cleartool: Error: Element "${file}" is already checked out to view "myview".\n`
    );
  });

  test("Cleartool checkout file already checked out - LogLevel=Trace", async () => {
    configHandler.configuration.useClearDlg.value = false;
    outputChannel.logLevel = LogLevel.Trace;
    configHandler.configuration.checkoutCommand.value = "-nc ${filename}";

    const file = path.join(testDir, "simple04.txt");

    const fileUri = vscode.Uri.parse(file);
    await provider.clearcase?.checkoutFile([fileUri]);
    assert.strictEqual(
      outputChannelBase.getLastLine(),
      `exit code 0, stderr: cleartool: Error: Element "${file}" is already checked out to view "myview".\n`
    );
  });
});

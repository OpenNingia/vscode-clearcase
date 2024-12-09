import * as assert from "assert";
import * as path from "path";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { ClearcaseScmProvider } from "../../provider/clearcase-scm-provider";
import { chmodSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "fs";
import { after, before, beforeEach } from "mocha";
import SuiteOutputChannel from "../mock/SuiteOutputChannel";
import { CCVersionState } from "../../clearcase/verstion-type";
import CcOutputChannel, { LogLevel } from "../../ui/output-channel";
import { ConfigurationHandler } from "../../configuration/configuration-handler";
// import * as myExtension from '../../extension';

//const WS_ROOT = process.env["WS_ROOT"] ? process.env["WS_ROOT"] : "";
const TEST_HOME = process.env["HOME"] ? process.env["HOME"] : "-";
const TEST_USER = process.env["USER"] ? process.env["USER"] : "-";

const delayTime = async (delay: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
};

suite("Cleartool Commands Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");
  let extensionContext: vscode.ExtensionContext;
  //let outputChannelBase: SuiteOutputChannel;
  //let outputChannel: CCOutputChannel;
  //let configHandler: ConfigurationHandler;
  //let provider: CCScmProvider;
  let testDir: string;

  before(async () => {
    await vscode.extensions.getExtension("vscode-clearcase")?.activate();
    /* eslint-disable */
    extensionContext = (global as any).testExtensionContext;
    /* eslint-enable */

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
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 800);
    });
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
    //    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    //    outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    //    outputChannel = new CCOutputChannel(outputChannelBase);
    //
    //    configHandler = new ConfigurationHandler();
    //    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    //    console.log("init", configHandler.configuration.executable.value);
    //    configHandler.configuration.logLevel.value = LogLevel.Debug;
    //    configHandler.configuration.useLabelAtCheckin.value = false;
    //    provider = new CCScmProvider(extensionContext, outputChannel, configHandler);
    //    await provider.init();
    //    outputChannel.clear();
    //    await delayTime(1000);
  });

  test("Cleartool change executable", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    outputChannel.clear();

    assert.strictEqual(
      configHandler.configuration.executable.value,
      path.join(__dirname, "../../../src/test/", "bin/cleartool.sh")
    );
  });

  test("Cleartool checkin file", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    const provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();

    configHandler.configuration.useClearDlg.value = false;
    configHandler.configuration.checkinCommand.value = "-nc ${filename}";

    const file = vscode.Uri.parse(path.resolve(__dirname, "testfiles/simple01.txt"));
    await provider.clearcase?.checkinFile([file]);
    delayTime(1000);
    assert.strictEqual(outputChannelBase.getLine(0), `ci,-nc,${path.join(testDir, "simple01.txt")}\n`);
    assert.strictEqual(
      outputChannelBase.getLastLine(),
      `Checked in "${path.join(testDir, "simple01.txt")}" version "/main/dev_01/2".\n`
    );
  });

  test("Cleartool checkout file (dynamic view)", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    const provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();

    configHandler.configuration.useClearDlg.value = false;
    configHandler.configuration.checkoutCommand.value = "-nc ${filename}";

    const file = vscode.Uri.parse(path.resolve(__dirname, "testfiles/simple01.txt"));
    await provider.clearcase?.checkoutFile([file]);
    delayTime(300);
    assert.strictEqual(outputChannelBase.getLine(0), `co,-nc,${path.join(testDir, "simple01.txt")}\n`);
    assert.strictEqual(
      outputChannelBase.getLine(1),
      `Checked out "${path.join(testDir, "simple01.txt")}" from version "/main/dev_01/1".\n`
    );
  });

  test("Cleartool checkout file (snapshot view)", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "SNAPSHOT";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    const provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();

    configHandler.configuration.useClearDlg.value = false;
    configHandler.configuration.checkoutCommand.value = "-nc ${filename}";
    const file = vscode.Uri.parse(path.resolve(__dirname, "testfiles/simple01.txt"));
    await provider.clearcase?.checkoutFile([file]);
    delayTime(300);
    assert.strictEqual(outputChannelBase.getLine(0), `co,-usehijack,-nc,${path.join(testDir, "simple01.txt")}\n`);
    assert.strictEqual(
      outputChannelBase.getLine(1),
      `Checked out "${path.join(testDir, "simple01.txt")}" from version "/main/dev_01/1".\n`
    );
  });

  test("Cleartool undo checkout file (keep)", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    const provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();

    configHandler.configuration.useClearDlg.value = false;

    const file = vscode.Uri.parse(path.resolve(__dirname, "testfiles/simple01.txt"));
    await provider.clearcase?.undoCheckoutFile([file]);
    delayTime(300);
    assert.strictEqual(outputChannelBase.getLine(0), `unco,-keep,${path.join(testDir, "simple01.txt")}\n`);
    assert.strictEqual(
      outputChannelBase.getLine(1),
      `Checkout cancelled for "${path.join(testDir, "simple01.txt")}".\n`
    );
  });

  test("Cleartool undo checkout file (delete)", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    const provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();

    configHandler.configuration.useClearDlg.value = false;
    configHandler.configuration.uncoKeepFile.value = false;

    const file = vscode.Uri.parse(path.resolve(__dirname, "testfiles/simple01.txt"));
    await provider.clearcase?.undoCheckoutFile([file]);
    delayTime(300);
    assert.strictEqual(outputChannelBase.getLine(0), `unco,-rm,${path.join(testDir, "simple01.txt")}\n`);
    assert.strictEqual(
      outputChannelBase.getLine(1),
      `Checkout cancelled for "${path.join(testDir, "simple01.txt")}".\n`
    );
  });

  test("Cleartool checkout file already checked out", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    const provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();

    configHandler.configuration.useClearDlg.value = false;
    configHandler.configuration.checkoutCommand.value = "-nc ${filename}";

    const file = path.join(testDir, "simple04.txt");

    const fileUri = vscode.Uri.parse(file);
    await provider.clearcase?.checkoutFile([fileUri]);
    delayTime(300);
    assert.strictEqual(outputChannelBase.getLine(0), `co,-nc,${file}\n`);
    assert.strictEqual(
      outputChannelBase.getLastLine(),
      `exit code 0, stderr: cleartool: Error: Element "${file}" is already checked out to view "myview".\n`
    );
  });

  test("Extension: Path names with environment variable", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    outputChannel.clear();

    configHandler.configuration.tempDir.value = "${env:HOME}/tmp";
    assert.strictEqual(`${TEST_HOME}/tmp`, configHandler.configuration.tempDir.value);
  });

  test("Extension: Path names with multiple environment variables", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;

    outputChannel.clear();

    configHandler.configuration.tempDir.value = "${env:HOME}/tmp/${env:USER}";
    assert.strictEqual(`${TEST_HOME}/tmp/${TEST_USER}`, configHandler.configuration.tempDir.value);
  });

  test("Extension: Path names with invalid variable 1", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;

    outputChannel.clear();

    configHandler.configuration.tempDir.value = "${HOME}/tmp";
    assert.strictEqual("${HOME}/tmp", configHandler.configuration.tempDir.value);
  });

  test("Extension: Path names with invalid variable 2", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;

    outputChannel.clear();

    configHandler.configuration.tempDir.value = "{HOME}/tmp";
    assert.strictEqual("{HOME}/tmp", configHandler.configuration.tempDir.value);
  });

  test("Extension: Path names with invalid variable 3", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;

    outputChannel.clear();

    configHandler.configuration.tempDir.value = "{env:}/tmp";
    assert.strictEqual("{env:}/tmp", configHandler.configuration.tempDir.value);
  });

  test("Extension: Path names with invalid variable 4", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;

    outputChannel.clear();

    configHandler.configuration.tempDir.value = "${env:}/tmp";
    assert.strictEqual("${env:}/tmp", configHandler.configuration.tempDir.value);
  });

  test("Extension: Path names with invalid variable 5", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;

    outputChannel.clear();

    configHandler.configuration.tempDir.value = "${env:}/tmp/${env:USER}";
    assert.strictEqual("${env:}/tmp" + `/${TEST_USER}`, configHandler.configuration.tempDir.value);
  });

  test("Extension: Version information of hijacked file", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    const provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();

    const file = path.join(testDir, "simple04_ro.txt");

    const info = `${file}@@/main/3 [hijacked]           Rule: element * A_SUPER_LABEL.0.0.1.0.1_3 [-mkbranch my_owndev]`;

    const version = provider.clearcase?.getVersionString(`${info}`, true);
    assert.strictEqual(version?.version, "/main/3");
    assert.strictEqual(version?.state, CCVersionState.Hijacked);
  });

  test("Extension: Version information of checkedin file", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    const provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();

    const file = path.join(testDir, "simple04_ro.txt");

    const info = `${file}@@/main/testbranch_01/my_owndev/3      Rule: element * A_SUPER_LABEL.0.0.1.0.1_3 [-mkbranch my_owndev]`;

    const version = provider.clearcase?.getVersionString(`${info}`, true);
    assert.strictEqual(version?.version, "/main/testbranch_01/my_owndev/3");
    assert.strictEqual(version?.state, CCVersionState.Versioned);
  });

  test("Extension: Version information of checkedout file", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    const provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();

    const file = path.join(testDir, "simple04_ro.txt");

    const info = `${file}@@/main/testbranch_01/my_owndev/CHECKEDOUT from /main/testbranch_01/my_owndev/0         Rule: CHECKEDOUT`;

    const version = provider.clearcase?.getVersionString(`${info}`, true);
    assert.strictEqual(version?.version, "/main/testbranch_01/my_owndev/CHECKEDOUT");
    assert.strictEqual(version?.state, CCVersionState.Versioned);
  });

  test("Extension: Version information of view private file", async () => {
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    const provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();

    const file = path.join(testDir, "simple04_ro.txt");

    const info = `${file}`;

    const version = provider.clearcase?.getVersionString(`${info}`, true);
    assert.strictEqual(version?.version, "view private");
    assert.strictEqual(version.state, CCVersionState.Untracked);
  });

  test("Extension: Version information of of empty file name string", async () => {
    const info = ``;
    process.env["CLEARCASE_TEST_VIEWTYPE"] = "DYNAMIC";
    const outputChannelBase = new SuiteOutputChannel("Clearcase SCM");
    const outputChannel = new CcOutputChannel(outputChannelBase);

    const configHandler = new ConfigurationHandler();
    configHandler.configuration.executable.value = path.join(__dirname, "../../../src/test/", "bin/cleartool.sh");
    configHandler.configuration.logLevel.value = LogLevel.Debug;
    configHandler.configuration.useLabelAtCheckin.value = false;
    const provider = new ClearcaseScmProvider(extensionContext, outputChannel, configHandler);
    await provider.init();
    outputChannel.clear();

    const version = provider.clearcase?.getVersionString(`${info}`, true);
    assert.strictEqual(version?.version, "not in a VOB");
    assert.strictEqual(version?.state, CCVersionState.Untracked);
  });
});

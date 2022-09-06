// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { commands, Disposable, ExtensionContext, OutputChannel, window, workspace } from "vscode";
import { CCConfigHandler } from "./ccConfigHandler";
import { CCScmProvider } from "./ccScmProvider";
import { ViewType } from "./clearcase";
import { UIInformation } from "./uiinformation";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
async function _activate(context: ExtensionContext, disposables: Disposable[]) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log("[vscode-clearcase] starting!");

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  const outputChannel: OutputChannel = window.createOutputChannel("Clearcase SCM");

  const configHandler = new CCConfigHandler();
  disposables.push(configHandler);

  const provider = new CCScmProvider(context, outputChannel, configHandler);
  disposables.push(provider);

  try {
    if (true === (await provider.init())) {
      provider.bindEvents();
      provider.bindCommands();

      provider.updateIsView().then((isView: boolean) => {
        const viewType = provider.clearCase ? provider.clearCase.viewType === ViewType.dynamic : false;
        const files = provider.getCheckedoutObjects();
        commands.executeCommand("setContext", "vscode-clearcase:enabled", isView);
        commands.executeCommand("setContext", "vscode-clearcase:DynView", viewType);
        commands.executeCommand("setContext", "vscode-clearcase:CheckedoutObjects", files);
      });

      provider.onWindowChanged(() => {
        const d = provider.clearCase ? provider.clearCase.viewType === ViewType.dynamic : false;
        const files = provider.getCheckedoutObjects();
        commands.executeCommand("setContext", "vscode-clearcase:enabled", provider.clearCase?.isView);
        commands.executeCommand("setContext", "vscode-clearcase:DynView", d);
        commands.executeCommand("setContext", "vscode-clearcase:CheckedoutObjects", files);
      }, provider);

      const uiInfo = new UIInformation(configHandler, window.activeTextEditor, provider.clearCase);
      disposables.push(uiInfo);
      console.log("[vscode-clearcase] started!");
    }
  } catch {
    window.showWarningMessage("VSCode-Clearcase extension could not be started");
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  const disposables: Disposable[] = [];
  context.subscriptions.push(new Disposable(() => Disposable.from(...disposables).dispose()));
  if (workspace.workspaceFolders !== undefined && workspace.workspaceFolders.length > 0) {
    await _activate(context, disposables).catch((err) => console.error(err));
  }
}

// this method is called when your extension is deactivated
export function deactivate(): void {
  // do nothing.
}

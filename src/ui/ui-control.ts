import { MessageItem, window } from "vscode";

export default class UiControl {
  public static async showCreateLabelInput(): Promise<string> {
    return (await window.showInputBox({ ignoreFocusOut: true, title: "Set a label after checkin" })) ?? "";
  }

  public static async showCommentInput(): Promise<string> {
    return (
      (await window.showInputBox({
        ignoreFocusOut: true,
        prompt: "Checkin comment",
      })) ?? ""
    );
  }

  public static async showCleartoolMsgBox(): Promise<boolean> {
    const userActions: MessageItem[] = [{ title: "Yes" }, { title: "No" }];
    const userAction = await window.showInformationMessage(`Do you want to checkin the current file?`, ...userActions);
    return userAction?.title === userActions[0].title;
  }

  public static showInformationMessage(text: string): void {
    window.showInformationMessage(text);
  }

  public static showErrorMessage(text: string): void {
    window.showErrorMessage(text);
  }

  public static async showVersionSelectQuickpick(items: string[] | Thenable<string[]>): Promise<string> {
    return (
      (await window.showQuickPick(items, {
        ignoreFocusOut: true,
        canPickMany: false,
        title: "Select a version",
      })) ?? ""
    );
  }
}

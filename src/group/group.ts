import { SourceControlResourceGroup, SourceControlResourceState, Uri } from "vscode";
import { VersionType } from "../clearcase/verstion-type";
import GroupIf from "./group-if";

export default class Group implements GroupIf {
  protected mGroup: SourceControlResourceState[] = [];

  constructor(protected mResourceGroup: SourceControlResourceGroup) {
    this.mResourceGroup.hideWhenEmpty = true;
  }

  getFileObjects(): Uri[] {
    return this.mGroup.map((e: SourceControlResourceState) => {
      return e.resourceUri;
    });
  }

  getFileNamesList(): string[] {
    return this.mGroup.map((e: SourceControlResourceState) => {
      return e.resourceUri.fsPath;
    });
  }

  createList(): void {
    throw new Error("Method not implemented.");
  }

  handleChangedFile(file: Uri, version: VersionType): void {
    throw new Error(`Method not implemented. ${file} ${version.state}`);
  }

  handleDeleteFile(file: Uri): void {
    this.mGroup = this.mGroup.filter((f: SourceControlResourceState) => {
      return f.resourceUri.fsPath !== file.fsPath;
    });
  }
  updateResourceGroup(): void {
    throw new Error("Method not implemented.");
  }
}

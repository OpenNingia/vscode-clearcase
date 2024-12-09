import { Uri } from "vscode";
import { VersionType } from "../clearcase/verstion-type";

export default interface GroupIf {
  createList(): void;
  handleChangedFile(file: Uri, version: VersionType): void;
  handleDeleteFile(file: Uri): void;
  handleUpdateFiles(files: string[]): void;
  updateResourceGroup(): void;
  getFileObjects(): Uri[];
  getFileNamesList(): string[];
  get firstUpdate(): boolean;
}

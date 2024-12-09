import { Uri } from "vscode";
import { VersionType } from "../clearcase/verstion-type";

export default interface GroupIf {
  createList(): void;
  handleChangedFile(file: Uri, version: VersionType): void;
  handleDeleteFile(file: Uri): void;
  updateResourceGroup(): void;
  getFileObjects(): Uri[];
  getFileNamesList(): string[];
}

import { SourceControlResourceGroup, Uri } from "vscode";
import { Clearcase } from "../clearcase/clearcase";
import { VersionType } from "../clearcase/verstion-type";
import { ScmResource, ResourceGroupType } from "../ui/scm-resource";
import { ScmStatus } from "../ui/scm-status";
import Group from "./group";

export class CheckoutGroup extends Group {
  constructor(resourceGroup: SourceControlResourceGroup, private mClearcase: Clearcase) {
    super(resourceGroup);
  }

  public override async createList(): Promise<void> {
    let checkedout: ScmResource[] = [];

    this.mClearcase?.findCheckouts().then((files) => {
      checkedout = files
        .map((val) => {
          return new ScmResource(ResourceGroupType.Index, Uri.file(val), ScmStatus.Modified);
        })
        .sort((val1, val2) => {
          return val1.resourceUri.fsPath.localeCompare(val2.resourceUri.fsPath);
        });
      this.mGroup = [...checkedout];
      this.updateResourceGroup();
    });
  }

  public override async handleChangedFile(file: Uri, version: VersionType): Promise<void> {
    let someChanged = false;
    const filtered =
      this.mResourceGroup.resourceStates.filter((item) => {
        if (item.resourceUri.fsPath !== file.fsPath) {
          return true;
        }
        someChanged = true;
        return false;
      }) ?? [];
    // file is checked out, add to resource state list
    if (version?.version.match(/checkedout/i) !== null) {
      filtered?.push(new ScmResource(ResourceGroupType.Index, file, ScmStatus.Modified));
      someChanged = true;
    }
    if (someChanged) {
      this.mResourceGroup.resourceStates = filtered?.sort((a, b) => ScmResource.sort(a, b)) || [];
    }
  }

  override handleDeleteFile(file: Uri): void {
    super.handleDeleteFile(file);
  }
}

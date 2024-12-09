import { SourceControlResourceGroup, Uri } from "vscode";
import { Clearcase } from "../clearcase/clearcase";
import { CCVersionState, VersionType } from "../clearcase/verstion-type";
import { ScmResource, ResourceGroupType } from "../ui/scm-resource";
import { ScmStatus } from "../ui/scm-status";
import { ConfigurationHandler } from "../configuration/configuration-handler";
import Group from "./group";

export class HijackedGroup extends Group {
  constructor(
    resourceGroup: SourceControlResourceGroup,
    private mClearcase: Clearcase,
    private mConfighandler: ConfigurationHandler
  ) {
    super(resourceGroup);
  }

  public override async createList(): Promise<void> {
    let hijacked: ScmResource[] = [];

    if (this.mConfighandler.configuration.showHijackedFiles.value) {
      this.mClearcase?.killUpdateFindHijacked();
      this.mClearcase?.findHijacked().then((files) => {
        hijacked = files
          .map((val) => {
            return new ScmResource(ResourceGroupType.Index, Uri.file(val), ScmStatus.Hijacked);
          })
          .sort((val1, val2) => {
            return val1.resourceUri.fsPath.localeCompare(val2.resourceUri.fsPath);
          });
        this.mGroup = [...hijacked];
        this.updateResourceGroup();
      });
    }
  }

  public override async handleChangedFile(file: Uri, version: VersionType): Promise<void> {
    const isHijacked = version?.state === CCVersionState.Hijacked;
    let hijackExists = false;
    const filtered =
      this.mResourceGroup.resourceStates.filter((item) => {
        if (item.resourceUri.fsPath === file.fsPath) {
          hijackExists = true;
          return isHijacked;
        }
        return false;
      }) ?? [];

    if (isHijacked && !hijackExists) {
      filtered?.push(new ScmResource(ResourceGroupType.Index, file, ScmStatus.Hijacked));
    }
    this.mGroup = [...filtered];
    this.updateResourceGroup();
  }

  public override updateResourceGroup(): void {
    if (this.mConfighandler.configuration.showHijackedFiles.value) {
      this.mResourceGroup.resourceStates = this.mGroup.sort((a, b) => ScmResource.sort(a, b)) || [];
    } else {
      this.mResourceGroup.resourceStates = [];
      this.mClearcase.killUpdateFindHijacked();
    }
  }

  public override handleDeleteFile(file: Uri): void {
    super.handleDeleteFile(file);
    this.updateResourceGroup();
  }
}

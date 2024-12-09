import { SourceControlResourceGroup, Uri } from "vscode";
import { Clearcase } from "../clearcase/clearcase";
import { CCVersionState, VersionType } from "../clearcase/verstion-type";
import { ScmResource, ResourceGroupType } from "../ui/scm-resource";
import { ScmStatus } from "../ui/scm-status";
import { ConfigurationHandler } from "../configuration/configuration-handler";
import Group from "./group";

export class ViewPrivateGroup extends Group {
  constructor(
    resourceGroup: SourceControlResourceGroup,
    private mClearcase: Clearcase,
    private mConfighandler: ConfigurationHandler
  ) {
    super(resourceGroup);
  }

  public override async createList(): Promise<void> {
    let viewPrivate: ScmResource[] = [];

    if (this.mConfighandler.configuration.showHijackedFiles.value) {
      this.mClearcase?.killUpdateFindViewPrivate();
      this.mClearcase?.findViewPrivate().then((files) => {
        viewPrivate = files
          .map((val) => {
            return new ScmResource(ResourceGroupType.Index, Uri.file(val), ScmStatus.Untracked);
          })
          .sort((val1, val2) => {
            return val1.resourceUri.fsPath.localeCompare(val2.resourceUri.fsPath);
          });
        this.mGroup = [...viewPrivate];
        this.updateResourceGroup();
      });
    }
  }

  public override async handleChangedFile(file: Uri, version: VersionType): Promise<void> {
    const isViewPrivate = version?.state === CCVersionState.Untracked;
    let viewPrivateExists = false;
    const filtered =
      this.mResourceGroup.resourceStates.filter((item) => {
        if (item.resourceUri.fsPath === file.fsPath) {
          viewPrivateExists = true;
          return isViewPrivate;
        }
        return false;
      }) ?? [];

    if (isViewPrivate && !viewPrivateExists) {
      filtered?.push(new ScmResource(ResourceGroupType.Index, file, ScmStatus.Hijacked));
    }
    this.mGroup = [...filtered];
    this.updateResourceGroup();
  }

  public override updateResourceGroup(): void {
    if (this.mConfighandler.configuration.showViewPrivateFiles.value) {
      this.mResourceGroup.resourceStates = this.mGroup.sort((a, b) => ScmResource.sort(a, b)) || [];
    } else {
      this.mResourceGroup.resourceStates = [];
      this.mClearcase.killUpdateFindViewPrivate();
    }
  }

  public override handleDeleteFile(file: Uri): void {
    super.handleDeleteFile(file);
    this.updateResourceGroup();
  }
}

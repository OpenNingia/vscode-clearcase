export class PathMapping {
  host: string = "";
  wsl: string = "";
}

export class ConfigurationProperty<T> {
  private mChanged: boolean;

  constructor(private mProp: T) {
    this.mChanged = true;
  }

  get value(): T {
    return this.mProp;
  }

  set value(value: T) {
    if (this.mProp !== value) {
      this.mProp = value;
      this.mChanged = true;
    }
  }

  get changed(): boolean {
    const old = this.mChanged;
    this.mChanged = false;
    return old;
  }
}

export class CCConfiguration {
  private mShowStatusbar = new ConfigurationProperty<boolean>(true);
  private mAnnotationColor = new ConfigurationProperty<string>("rgba(220, 220, 220, 0.8)");
  private mAnnotationBackgroundColor = new ConfigurationProperty<string>(
    "rgba(20, 20, 20, 0.8)"
  );
  private mAnnotationFormatString = new ConfigurationProperty<string>("%d %12u");
  private mShowAnnotationCodeLens = new ConfigurationProperty<boolean>(true);
  private mUseClearDlg = new ConfigurationProperty<boolean>(true);
  private mCheckoutCommand = new ConfigurationProperty<string>(
    "-comment ${comment} ${filename}"
  );
  private mFindCheckoutsCommand = new ConfigurationProperty<string>("-me -cview -short -avobs");
  private mUncoKeepFile = new ConfigurationProperty<boolean>(true);
  private mCheckinCommand = new ConfigurationProperty<string>("-comment ${comment} ${filename}");
  private mDefaultComment = new ConfigurationProperty<string>("");
  private mViewPrivateFiles = new ConfigurationProperty<string>("(hh|cpp|def|c|h|txt)$");
  private mExecutable = new ConfigurationProperty<string>("cleartool.exe");
  private mTempDir = new ConfigurationProperty<string>("c:\\Temp");
  private mUseRemoteClient = new ConfigurationProperty<boolean>(false);
  private mWebserverUsername = new ConfigurationProperty<string>("");
  private mWebserverPassword = new ConfigurationProperty<string>("");
  private mWebserverAddress = new ConfigurationProperty<string>("");
  private mDetectWslEnvironment = new ConfigurationProperty<boolean>(false);
  private mPathMapping = new ConfigurationProperty<PathMapping[]>([])
  private mDiffEncoding = new ConfigurationProperty<string>("");

  get showStatusbar(): ConfigurationProperty<boolean> {
    return this.mShowStatusbar;
  }

  get showAnnotationCodeLens(): ConfigurationProperty<boolean> {
    return this.mShowAnnotationCodeLens;
  }

  get annotationColor(): ConfigurationProperty<string> {
    return this.mAnnotationColor;
  }

  get annotationBackground(): ConfigurationProperty<string> {
    return this.mAnnotationBackgroundColor;
  }

  get annotationFormatString(): ConfigurationProperty<string> {
    return this.mAnnotationFormatString;
  }

  get useClearDlg(): ConfigurationProperty<boolean> {
    return this.mUseClearDlg;
  }

  get checkoutCommand(): ConfigurationProperty<string> {
    return this.mCheckoutCommand;
  }

  get checkinCommand(): ConfigurationProperty<string> {
    return this.mCheckinCommand;
  }

  get findCheckoutsCommand(): ConfigurationProperty<string> {
    return this.mFindCheckoutsCommand;
  }

  get uncoKeepFile(): ConfigurationProperty<boolean> {
    return this.mUncoKeepFile;
  }

  get defaultComment(): ConfigurationProperty<string> {
    return this.mDefaultComment;
  }

  get viewPrivateFileSuffixes(): ConfigurationProperty<string> {
    return this.mViewPrivateFiles;
  }

  get executable(): ConfigurationProperty<string> {
    return this.mExecutable;
  }

  get tempDir(): ConfigurationProperty<string> {
    return this.mTempDir;
  }

  get useRemoteClient(): ConfigurationProperty<boolean> {
    return this.mUseRemoteClient;
  }

  get webserverUsername(): ConfigurationProperty<string> {
    return this.mWebserverUsername;
  }

  get webserverPassword(): ConfigurationProperty<string> {
    return this.mWebserverPassword;
  }

  get webserverAddress(): ConfigurationProperty<string> {
    return this.mWebserverAddress;
  }

  get detectWslEnvironment(): ConfigurationProperty<boolean> {
    return this.mDetectWslEnvironment;
  }

  get pathMapping(): ConfigurationProperty<PathMapping[]> {
    return this.mPathMapping;
  }

  get diffViewEncoding(): ConfigurationProperty<string> {
    return this.mDiffEncoding;
  }
}

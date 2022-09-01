export class ConfigurationProperty<T> {
  private mChanged: boolean;

  public constructor(private mProp: T) {
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
  private mIsWslEnv = new ConfigurationProperty<boolean>(false);
  private mUseRemoteClient = new ConfigurationProperty<boolean>(false);
  private mWebserverUsername = new ConfigurationProperty<string>("");
  private mWebserverPassword = new ConfigurationProperty<string>("");
  private mWebserverAddress = new ConfigurationProperty<string>("");

  public get showStatusbar(): ConfigurationProperty<boolean> {
    return this.mShowStatusbar;
  }

  public get showAnnotationCodeLens(): ConfigurationProperty<boolean> {
    return this.mShowAnnotationCodeLens;
  }

  public get annotationColor(): ConfigurationProperty<string> {
    return this.mAnnotationColor;
  }

  public get annotationBackground(): ConfigurationProperty<string> {
    return this.mAnnotationBackgroundColor;
  }

  public get annotationFormatString(): ConfigurationProperty<string> {
    return this.mAnnotationFormatString;
  }

  public get useClearDlg(): ConfigurationProperty<boolean> {
    return this.mUseClearDlg;
  }

  public get checkoutCommand(): ConfigurationProperty<string> {
    return this.mCheckoutCommand;
  }

  public get checkinCommand(): ConfigurationProperty<string> {
    return this.mCheckinCommand;
  }

  public get findCheckoutsCommand(): ConfigurationProperty<string> {
    return this.mFindCheckoutsCommand;
  }

  public get uncoKeepFile(): ConfigurationProperty<boolean> {
    return this.mUncoKeepFile;
  }

  public get defaultComment(): ConfigurationProperty<string> {
    return this.mDefaultComment;
  }

  public get viewPrivateFileSuffixes(): ConfigurationProperty<string> {
    return this.mViewPrivateFiles;
  }

  public get executable(): ConfigurationProperty<string> {
    return this.mExecutable;
  }

  public get tempDir(): ConfigurationProperty<string> {
    return this.mTempDir;
  }

  public get isWslEnv(): ConfigurationProperty<boolean> {
    return this.mIsWslEnv;
  }

  public get useRemoteClient(): ConfigurationProperty<boolean> {
    return this.mUseRemoteClient;
  }

  public get webserverUsername(): ConfigurationProperty<string> {
    return this.mWebserverUsername;
  }

  public get webserverPassword(): ConfigurationProperty<string> {
    return this.mWebserverPassword;
  }

  public get webserverAddress(): ConfigurationProperty<string> {
    return this.mWebserverAddress;
  }
}

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
  private mShowStatusbar: ConfigurationProperty<boolean> = new ConfigurationProperty(true);
  private mAnnotationColor: ConfigurationProperty<string> = new ConfigurationProperty("rgba(220, 220, 220, 0.8)");
  private mAnnotationBackgroundColor: ConfigurationProperty<string> = new ConfigurationProperty(
    "rgba(20, 20, 20, 0.8)"
  );
  private mAnnotationFormatString: ConfigurationProperty<string> = new ConfigurationProperty("%d %12u");
  private mShowAnnotationCodeLens: ConfigurationProperty<boolean> = new ConfigurationProperty(true);
  private mUseClearDlg: ConfigurationProperty<boolean> = new ConfigurationProperty(true);
  private mCheckoutCommand: ConfigurationProperty<string> = new ConfigurationProperty(
    "-comment ${comment} ${filename}"
  );
  private mFindCheckoutsCommand: ConfigurationProperty<string> = new ConfigurationProperty("-me -cview -short -avobs");
  private mUncoKeepFile: ConfigurationProperty<boolean> = new ConfigurationProperty(true);
  private mCheckinCommand: ConfigurationProperty<string> = new ConfigurationProperty("-comment ${comment} ${filename}");
  private mDefaultComment: ConfigurationProperty<string> = new ConfigurationProperty("");
  private mViewPrivateFiles: ConfigurationProperty<string> = new ConfigurationProperty("(hh|cpp|def|c|h|txt)$");
  private mExecutable: ConfigurationProperty<string> = new ConfigurationProperty("cleartool.exe");
  private mTempDir: ConfigurationProperty<string> = new ConfigurationProperty("c:\\Temp");
  private mIsWslEnv: ConfigurationProperty<boolean> = new ConfigurationProperty(false);
  private mUseRemoteClient: ConfigurationProperty<boolean> = new ConfigurationProperty(false);
  private mWebserverUsername: ConfigurationProperty<string> = new ConfigurationProperty("");
  private mWebserverPassword: ConfigurationProperty<string> = new ConfigurationProperty("");
  private mWebserverAddress: ConfigurationProperty<string> = new ConfigurationProperty("");

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

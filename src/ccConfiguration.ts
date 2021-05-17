'use strict';

export class ConfigurationProperty<T>{
	private m_changed: boolean;

	public constructor(private m_prop: T) {
		this.m_changed = true;
	}

	get Value(): T {
		return this.m_prop;
	}

	get Changed(): boolean {
		let old = this.m_changed;
		this.m_changed = false;
		return old;
	}

	set Value(value:T) {
		if( this.m_prop != value )
		{
			this.m_prop = value;
			this.m_changed = true;
		}
	}
}

export class ccConfiguration
{
	private m_showStatusbar: ConfigurationProperty<boolean> = new ConfigurationProperty(true);
	private m_annotationColor: ConfigurationProperty<string> = new ConfigurationProperty("rgba(220, 220, 220, 0.8)");
	private m_annotationBackgroundColor: ConfigurationProperty<string> = new ConfigurationProperty("rgba(20, 20, 20, 0.8)");
	private m_annotationFormatString: ConfigurationProperty<string> = new ConfigurationProperty("%d %12u");
	private m_showAnnotationCodeLens: ConfigurationProperty<boolean> = new ConfigurationProperty(true);
	private m_useClearDlg: ConfigurationProperty<boolean> = new ConfigurationProperty(true);
	private m_checkoutCommand: ConfigurationProperty<string> = new ConfigurationProperty("-comment ${comment} ${filename}");
	private m_findCheckoutsCommand: ConfigurationProperty<string> = new ConfigurationProperty("-me -cview -short -avobs");
	private m_uncoKeepFile: ConfigurationProperty<boolean> = new ConfigurationProperty(true);
	private m_checkinCommand: ConfigurationProperty<string> = new ConfigurationProperty("-comment ${comment} ${filename}");
	private m_defaultComment: ConfigurationProperty<string> = new ConfigurationProperty("");
	private m_viewPrivateFiles: ConfigurationProperty<string> = new ConfigurationProperty('(hh|cpp|def|c|h|txt)$');
	private m_executable: ConfigurationProperty<string> = new ConfigurationProperty('cleartool.exe');
	private m_tempDir: ConfigurationProperty<string> = new ConfigurationProperty('c:\\Temp');

	public get ShowStatusbar() : ConfigurationProperty<boolean> {
		return this.m_showStatusbar;
	}

	public get ShowAnnotationCodeLens() : ConfigurationProperty<boolean> {
		return this.m_showAnnotationCodeLens;
	}

	public get AnnotationColor() : ConfigurationProperty<string> {
		return this.m_annotationColor;
	}

	public get AnnotationBackground() : ConfigurationProperty<string> {
		return this.m_annotationBackgroundColor;
	}

	public get AnnotationFormatString() : ConfigurationProperty<string> {
		return this.m_annotationFormatString;
	}

	public get UseClearDlg() : ConfigurationProperty<boolean> {
		return this.m_useClearDlg;
	}

	public get CheckoutCommand() : ConfigurationProperty<string> {
		return this.m_checkoutCommand;
	}	

	public get CheckinCommand() : ConfigurationProperty<string> {
		return this.m_checkinCommand;
	}

	public get FindCheckoutsCommand() : ConfigurationProperty<string> {
		return this.m_findCheckoutsCommand;
	}

	public get UncoKeepFile() : ConfigurationProperty<boolean> {
		return this.m_uncoKeepFile;
	}

	public get DefaultComment(): ConfigurationProperty<string> {
		return this.m_defaultComment;
	}

	public get ViewPrivateFileSuffixes(): ConfigurationProperty<string> {
		return this.m_viewPrivateFiles;
	}

	public get Executable(): ConfigurationProperty<string> {
		return this.m_executable;
	}

	public get TempDir(): ConfigurationProperty<string> {
		return this.m_tempDir;
	}
}
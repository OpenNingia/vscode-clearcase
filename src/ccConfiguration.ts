'use strict';

import * as vscode from 'vscode';


export class ccConfiguration
{
	private m_showStatusbar: boolean = true;
	private m_annotationColor: string = "rgba(220, 220, 220, 0.8)";
	private m_annotationBackgroundColor: string ="rgba(20, 20, 20, 0.8)";
	private m_annotationFormatString: string = "%d %12u";
	private m_showAnnotationCodeLens: boolean = true;
	private m_useClearDlg: boolean = true;
	private m_checkoutCommand: string = "-comment ${comment} ${filename}";
	private m_checkinCommand: string = "-comment ${comment} ${filename}";
	private m_defaultComment: string = null;

	public set ShowStatusbar(iDo : boolean) {
		this.m_showStatusbar = iDo;
	}

	public set ShowAnnotationCodeLens(iDo : boolean) {
		this.m_showAnnotationCodeLens = iDo;
	}

	public set AnnotationColor(iColor : string) {
		this.m_annotationColor = iColor;
	}

	public set AnnotationBackground(iColor : string) {
		this.m_annotationBackgroundColor = iColor;
	}

	public set AnnotationFormatString(iFormat : string)
	{
		this.m_annotationFormatString = iFormat;
	}

	public set UseClearDlg(iDo : boolean) {
		this.m_useClearDlg = iDo;
	}

	public set CheckoutCommand(sValue : string) {
		this.m_checkoutCommand = sValue;
	}	

	public set CheckinCommand(sValue : string) {
		this.m_checkinCommand = sValue;
	}
	
	public set DefaultComment(sValue : string) {
		this.m_defaultComment = sValue;
	}	

	public get ShowStatusbar() : boolean {
		return this.m_showStatusbar;
	}

	public get ShowAnnotationCodeLens() : boolean {
		return this.m_showAnnotationCodeLens;
	}

	public get AnnotationColor() : string {
		return this.m_annotationColor;
	}

	public get AnnotationBackground() : string {
		return this.m_annotationBackgroundColor;
	}

	public get AnnotationFormatString() : string {
		return this.m_annotationFormatString;
	}

	public get UseClearDlg() : boolean {
		return this.m_useClearDlg;
	}

	public get CheckoutCommand() : string {
		return this.m_checkoutCommand;
	}	

	public get CheckinCommand() : string {
		return this.m_checkinCommand;
	}	

	public get DefaultComment() {
		return this.m_defaultComment;
	}		
}
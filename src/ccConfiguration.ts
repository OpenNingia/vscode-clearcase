'use strict';

import * as vscode from 'vscode';


export class ccConfiguration
{
	private m_showStatusbar: boolean = true;
	private m_annotationColor: string = "rgba(220, 220, 220, 0.8)";
	private m_annotationBackgroundColor: string ="rgba(20, 20, 20, 0.8)";

	public set ShowStatusbar(iDo : boolean) {
		this.m_showStatusbar = iDo;
	}
	
	public set AnnotationColor(iColor : string) {
		this.m_annotationColor = iColor;
	}
	
	public set AnnotationBackground(iColor : string) {
		this.m_annotationBackgroundColor = iColor;
	}
	
	public get ShowStatusbar() : boolean {
		return this.m_showStatusbar;
	}
	
	public get AnnotationColor() : string {
		return this.m_annotationColor;
	}

	public get AnnotationBackground() : string {
		return this.m_annotationBackgroundColor;
	}
}
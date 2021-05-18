## Release Notes

### 3.0.0
* added WSL compatibility when using cleartool.exe in a wsl environment.
  * **check** check if the default value for the temporary directory is valid on your setup
* added new configuration dates
  * executable: the default cleartool executable
  * tempDir: the temp file path (in WSL it will be used by this extension. In case you use the cleartool.exe, this path has to be a windows style path)
  * uncoKeepFile: keep unchecked out files

### 2.7.0
* Option to keep file when undo checkout

### 2.6.0
* Fixed api to work with vscode 1.39.0, due to some changes in implementation now the extension only works with the first opened workspace

### 2.5.3
* Improved handling of untracked files
* Added new Context entry `create versioned object`
* Added command + button to edit configspec of current view

### 2.4.3
* Fix handling of network drive paths in the scm panel.

### 2.4.2
* Security update

### 2.4.1
* More improvement on untracked files' handling
* Show progress information in SCM view when checkin all is triggered

### 2.4.0
* Improved handling of untracked files
* Fixed a crash when opening a window that doesn't contain workspace folders

### 2.3.0
* Added mkelem command to check-in a file into source control
* Improved untracked files handling
* Other fixes and error handling

### 2.1.0
* Added a button to search for View Private files, you can control which files are added to the view by placing a `.ccignore`
  file on the root of your workspace. This file behaves in a similar way as `.gitignore`.
* Added QuickDiff support for checked out files. Click on the gutter indicator to view the difference.
* Clicking on a checked out file in the SCM view will now show the difference with the latest version in the embedded diff viewer.

### 2.0.3
* Fixed regression, Find checkout command was not working.

### 2.0.2
* Integrated SCM API (best user experience when `vscode-clearcase.useClearDlg` is set to false)
* Untracked files are listed in the SCM View, file types can be configured by `vscode-clearcase.viewPrivateFileSuffixes`
* Checkedout files are listed in the SCM View
* Checkin all files via the SCM View, also add comment
* New context menu `delete file` for view private files

Special thanks to https://github.com/fr43nk for the contributions.

### 2.0.1
* Implemented new SCM api

### 1.12.2
* Updated to last vscode dependency to avoid url-parse vulnerability

### 1.12.1
* Updated some dependencies to avoid vulnerability warnings

### 1.12.0
* Added an option to toggle the usage of "clearDlg" for checkouts and checkings. Useful on Linux boxes.
* Implemented "Change current activity" command
* Added "DefaultComment" option that is used on both checkout and checkins ( ignored when useClearDlg is true ).

### 1.11.0
* Added an option to disable the Annotation Code Lens ( `vscode-clearcase.showAnnotationCodeLens` )

### 1.10.0
* Some configuration flags were not honored on extension load
* Added syntax definition for ClearCase config-spec file

### 1.9.2
* Status bar events are now correnctly registered even when no editor is opened

### 1.9.1
* Annotate code lens is now activated only on valid clearcase objects

### 1.9.0
* Fixed context menu being activated in Output window
* Annotate is now a code lens

### 1.8.0
* Added editor context menu
* The extension is now activated only when a clearcase view is detected

### 1.7.0
* Added (optional) status bar information
* Added Annotate command

### 1.6.0
* Fixed an issue that would restart the checkout dialog after canceling the checkout process
* Added Clearcase: Update command in tree view context menu
* Added Clearcase: Update View ( that launch the Clearcase update view native GUI )
* Added Clearcase: Update Directories ( that updates in background the parent directory of the active document )

Special thanks to https://github.com/fr43nk for the contributions.

### 1.5.1
* Fixed an issue that prevents some commands to work on file path with whitespaces

### 1.5.0
* Added "Find modified files" command
* Added "Update" command
* Added "Item properties" command
* Programmatically saved the document after "Checkout on save"
  this helps reducing the noise of the "save error" infobar

### 1.4.0
* Added "Find Checkouts" command

### 1.3.0
* Proposing Checkout when saving a file under version control

**Enjoy!**
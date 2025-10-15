## Release Notes

### 5.2.1

_Feature_

- Compare with predecessor now uses vscode internal diff viewer (#203)
- Compare with predecessor is now default command in editor title
- Clearcase History command now available in context menu and command palette (#205)

### 5.2.0

_Feature_

- Set the execution context of the extension

_Fixes_

- better path handling when using the pathMapping configuration
- does not create a _${env_ file if default _${env:CLEACASE_AVOBS}_ is not part of the environment

### 5.1.0

_Feature_

- Cleartool context menu as submenu
- Editor title commands
- Handling of internal commands

### 5.0.0

_Feature_

- create and handle hijacked files
- better view private handling
- internal diff viewer for version compare
- logging levels in output console

_Bugfix_

- compare to predecessor instead of latest when file is checkedout
- fixed icons

### 4.7.0

_Feature_

- it is now possible to use the ${env:VARIBALE} syntax in all configuration properties of the extension

### 4.6.2

_Bugfix_

- fixed endless loop of cleartool command in case of an error

### 4.6.1

_Bugfix_

- fixed synchrous command execution. Clearcase commands did block each other.

### 4.6.0

_Feature_

- activate automatic detection of wsl environment `vscode-clearcase.wsl.detectEnvironment`
- added a path mapping setting. This is used to map a windows drive letter to a wsl mount point
  `vscode-clearcase.wsl.pathMapping`
- set the encoding of the internal diff viewer `vscode-clearcase.diffViewerEncoding`

_Bugfixes_

- correct usage of temp directory in wsl environment

### 4.5.0

_Feature_

- Use dialog box for checkin, checkout and undo checkout in linux

_Bugfixes_

- use the configured clearcase binary

### 4.4.1

_Improvement_

- Optimized the version aggregation of a file by using the `cleartool describe` command

### 4.4.0

_Feature_

- Checkin all selected files in the SMC view at once

### 4.3.0

_Feature_

- it is now possible to select multiple files and execute a clearcase command on those files

_Bugfixes_

- fixes error message loop when saving a checked in file and the checkout branch does not exist in the vob
- fixes error log output if log window gets selected

### 4.2.0

_Feature_

- context entries are dependend of file state (checkout/checkin)

_Bugfix_

Thanks to @jmue

- #120
- #121
- #122
- #123
- #124

### 4.1.1

_Bugfix_

- #106
- #110
- #112
- #114

### 4.1.0

- Usage of Webpack for packaging, which results in faster startup time.

### 4.0.1

- fixed syntax highlighting in configspec file (thanks to @jsinger67)
- fixed typo in package.json

### 4.0.0

- added support for remote cleartool client (thanks to @bw1faeh0)

  - New configuration parameters are available
    - remoteCleartool.enable
    - remoteCleartool.webserverUsername
    - remoteCleartool.webserverPassword
    - remoteCleartool.webserverAddress

- **Breaking change**
  some configuration names have change for better readability
  - showAnnotationCodeLens -> **annotation.showAnnotationCodeLens**
  - annotationColor -> **annotation.color**
  - annotationBackgroundColor -> **annotation.backgroundColor**
  - annotationFormatString -> **annotation.formatString**
  - useClearDlg -> **cleartool.useDialog**
  - checkoutCommandArgs -> **cleartool.checkoutCommandArguments**
  - findCheckoutsCommandArgs -> **cleartool.findCheckoutsCommandArguments**
  - checkinCommandArgs -> **cleartool.checkinCommandArguments**
  - defaultComment -> **cleartool.defaultComment**
  - executable -> **cleartool.executable**
  - isWslEnv -> **isWslEnvironment**
  - uncoKeepFile -> **cleartool.undoCheckouKeepFile**

### 3.0.2

- Fix nagging error messages when editing unsaved files

### 3.0.1

- Security update

### 3.0.0

- added WSL compatibility when using cleartool.exe in a wsl environment.
  - **check** check if the default value for the temporary directory is valid on your setup
- added new configuration dates
  - executable: the default cleartool executable
  - tempDir: the temp file path (in WSL it will be used by this extension. In case you use the cleartool.exe, this path has to be a windows style path)
  - uncoKeepFile: keep unchecked out files

### 2.7.0

- Option to keep file when undo checkout

### 2.6.0

- Fixed api to work with vscode 1.39.0, due to some changes in implementation now the extension only works with the first opened workspace

### 2.5.3

- Improved handling of untracked files
- Added new Context entry `create versioned object`
- Added command + button to edit configspec of current view

### 2.4.3

- Fix handling of network drive paths in the scm panel.

### 2.4.2

- Security update

### 2.4.1

- More improvement on untracked files' handling
- Show progress information in SCM view when checkin all is triggered

### 2.4.0

- Improved handling of untracked files
- Fixed a crash when opening a window that doesn't contain workspace folders

### 2.3.0

- Added mkelem command to check-in a file into source control
- Improved untracked files handling
- Other fixes and error handling

### 2.1.0

- Added a button to search for View Private files, you can control which files are added to the view by placing a `.ccignore`
  file on the root of your workspace. This file behaves in a similar way as `.gitignore`.
- Added QuickDiff support for checked out files. Click on the gutter indicator to view the difference.
- Clicking on a checked out file in the SCM view will now show the difference with the latest version in the embedded diff viewer.

### 2.0.3

- Fixed regression, Find checkout command was not working.

### 2.0.2

- Integrated SCM API (best user experience when `vscode-clearcase.useClearDlg` is set to false)
- Untracked files are listed in the SCM View, file types can be configured by `vscode-clearcase.viewPrivateFileSuffixes`
- Checkedout files are listed in the SCM View
- Checkin all files via the SCM View, also add comment
- New context menu `delete file` for view private files

Special thanks to https://github.com/fr43nk for the contributions.

### 2.0.1

- Implemented new SCM api

### 1.12.2

- Updated to last vscode dependency to avoid url-parse vulnerability

### 1.12.1

- Updated some dependencies to avoid vulnerability warnings

### 1.12.0

- Added an option to toggle the usage of "clearDlg" for checkouts and checkings. Useful on Linux boxes.
- Implemented "Change current activity" command
- Added "DefaultComment" option that is used on both checkout and checkins ( ignored when useClearDlg is true ).

### 1.11.0

- Added an option to disable the Annotation Code Lens ( `vscode-clearcase.showAnnotationCodeLens` )

### 1.10.0

- Some configuration flags were not honored on extension load
- Added syntax definition for ClearCase config-spec file

### 1.9.2

- Status bar events are now correnctly registered even when no editor is opened

### 1.9.1

- Annotate code lens is now activated only on valid clearcase objects

### 1.9.0

- Fixed context menu being activated in Output window
- Annotate is now a code lens

### 1.8.0

- Added editor context menu
- The extension is now activated only when a clearcase view is detected

### 1.7.0

- Added (optional) status bar information
- Added Annotate command

### 1.6.0

- Fixed an issue that would restart the checkout dialog after canceling the checkout process
- Added Clearcase: Update command in tree view context menu
- Added Clearcase: Update View ( that launch the Clearcase update view native GUI )
- Added Clearcase: Update Directories ( that updates in background the parent directory of the active document )

Special thanks to https://github.com/fr43nk for the contributions.

### 1.5.1

- Fixed an issue that prevents some commands to work on file path with whitespaces

### 1.5.0

- Added "Find modified files" command
- Added "Update" command
- Added "Item properties" command
- Programmatically saved the document after "Checkout on save"
  this helps reducing the noise of the "save error" infobar

### 1.4.0

- Added "Find Checkouts" command

### 1.3.0

- Proposing Checkout when saving a file under version control

**Enjoy!**

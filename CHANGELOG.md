## Release Notes

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
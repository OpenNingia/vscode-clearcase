# VS Code ClearCase

This repository contains the extension for [IBM Rational ClearCase SCM](http://www-03.ibm.com/software/products/en/clearcase) for the [VS Code](https://code.visualstudio.com) editor.

## Features

Clearcase commands exposed by this extensions:

    * Launch ClearCase Explorer
    * Checkout
    * Checkin
    * Undo Checkout
    * Version Tree
    * Compare with previous version
    * Find Checkouts
    * Find modified files
    * Update snapshot
    * Item Properties
    * Annotate

### GUI

   * Auto show checkout dialog on save if file isn't checked out.
   * Show version of current file in the status bar. This can be disabled via the user setting

     ```TypeScript
     vscode-clearcase.showVersionInStatusbar = false
     ```

   * Annotate code lens is customizable via these user settings

     ```TypeScript
     vscode-clearcase.annotationColor = rgba(220, 220, 220, 0.8)
     vscode-clearcase.annotationBackgroundColor = rgba(20, 20, 20, 0.8)
     vscode-clearcase.annotationFormatString = "%d %12u"
     ```

     Format string is documented at https://www.ibm.com/support/knowledgecenter/SSSH27_8.0.0/com.ibm.rational.clearcase.cc_ref.doc/topics/fmt_ccase.htm

   * Syntax highlighting for ClearCase config-spec files

## Requirements

A valid ClearCase installation within the system's PATH.

## License
[MIT](LICENSE)

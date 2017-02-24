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
    * Annotations

All commands are relative to the current file.

### GUI

   * Auto show checkout dialog on save if file isn't checked out.
   * Show version of current file in the status bar. This can be disabled via the user setting
   
     ```TypeScript
     vscode-clearcase.showVersionInStatusbar = false
     ```

## Requirements

A valid ClearCase installation within the system's PATH.

## License
[MIT](LICENSE)

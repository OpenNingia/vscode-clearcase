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
    * Set current Activity
    * Remote Cleartool Client

### GUI

   * Automatically checkout on save if file isn't checked out.
   * Show view private and checkedout files in SCM view
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

     Format string is documented at https://www.ibm.com/docs/en/clearcase/11.0.0?topic=information-fmt-ccase#ref_fmtccase_refsect2_36512

   * Syntax highlighting for ClearCase config-spec files

## Remote Cleartool Client

It is possible to use the remote cleartool client with VSCode. To activate, set the configuration `vscode-clearcase.remoteCleartool.enable` to `true`. With that set, insert the username to `vscode-clearcase.remoteCleartool.webviewUsername`. When connecting to the server, the password will be requested. It is stored as long as the VSCode window lives. Alternatively there is a setting for storing the password in the configuration `vscode-clearcase.remoteCleartool.webviewPassword`.

## WSL

You can use this extenion in a WSL environment and a windows clearcase installation. Just make sure the configured **executeable** is the windows one (this is the default). The second important setting is the **tempDir** value. If you use a windows cleartool binary the temp dir needs to be a windows style path as already set by default. This path needs to be reachable by the windows cleartool executable. Therefor it is not possible to use a wsl linux only path like `/tmp/`.

If the above settings are correct everything else is handled by the extension transparantly.

If the windows drives are not mounted in the default `/mnt/<letter>` paths one can use a mapping in the settings

```
vscode-clearcase.wsl.pathMapping: [
  {
    "host": "c:\\", "wsl": "/mnt/c",
    "host": "d:\\", "wsl": "/external/d"
  }
]
```

## Requirements

A valid ClearCase installation within the system's PATH or a valid executable path setup in the **extension** preferences value.

## License
[MIT](LICENSE)

[![CodeFactor](https://www.codefactor.io/repository/github/openningia/vscode-clearcase/badge)](https://www.codefactor.io/repository/github/openningia/vscode-clearcase)
[![.github/workflows/publish.yml](https://github.com/OpenNingia/vscode-clearcase/actions/workflows/publish.yml/badge.svg)](https://github.com/OpenNingia/vscode-clearcase/actions/workflows/publish.yml)
[![Test on master](https://github.com/OpenNingia/vscode-clearcase/actions/workflows/integrate_test.yml/badge.svg)](https://github.com/OpenNingia/vscode-clearcase/actions/workflows/integrate_test.yml)
![Visual Studio Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/OpenNingia.vscode-clearcase)
![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/OpenNingia.vscode-clearcase)

# VS Code ClearCase

This repository contains the extension for [IBM Rational ClearCase SCM](http://www-03.ibm.com/software/products/en/clearcase) for the [VS Code](https://code.visualstudio.com) editor.

## Table Of Contents

- [Features](#features)
- [GUI](#gui)
- [Compare Versions](#compare-versions)
- [View Private Files](#view-private-files)
- [Hijacked Files](#hijacked-files)
- [Remote Control Client](#remote-cleartool-client)
- [Execution Context](#execution-context)
- [WSL](#wsl)
- [Logging](#logging)
- [Requirements](#requirements)

## Features

Clearcase commands exposed by this extensions:

- Launch ClearCase Explorer
- Checkout
- Checkin
- Undo Checkout
- Handling of hijack files
- Version Tree
- Compare with previous version
- Find Checkouts
- Find modified files
- List view private files
- Update snapshot
- Item Properties
- Annotate
- Set current Activity
- Remote Cleartool Client

## GUI

- Automatically checkout on save if file isn't checked out.
- Show view private and checkedout files in SCM view
- Show version of current file in the status bar. This can be disabled via the user setting

  ```TypeScript
  vscode-clearcase.showVersionInStatusbar = false
  ```

- Annotate code lens is customizable via these user settings

  ```TypeScript
  vscode-clearcase.annotationColor = rgba(220, 220, 220, 0.8)
  vscode-clearcase.annotationBackgroundColor = rgba(20, 20, 20, 0.8)
  vscode-clearcase.annotationFormatString = "%d %12u"
  ```

  Format string is documented at https://www.ibm.com/docs/en/clearcase/11.0.0?topic=information-fmt-ccase#ref_fmtccase_refsect2_36512

- Syntax highlighting for ClearCase config-spec files

## Compare Versions

Compare an arbitrary version to the current open version. Use the command **Clearcase: Compare with version** and choose the version.
It uses the integrate vscode diff viewer.

## View Private Files

To show view private files in the source control view, there are two configuration parameters

- `clearcase.showViewPrivateFiles` - to activate the feature
- `clearcase.findViewPrivateCommandArguments` - the command and its arguments to find view private files
- `viewPrivateFileSuffixes` - filter the files by regex. The default `(hh|cpp|def|c|h|txt)$` can be a good start.

Depending on the view type, snapshot or dynamic, there are different commands.

**Snapshot**

- `cleartool ls -view_only -rec $CLEARCASE_AVOBS`

The $CLEARCASE_AVOBS variable can be replaced by a list of vobs separated by a space

**Dynamic**

- cleartool lsprivate -short

As a default, this extension is preconfigured for snapshot views.

## Hijacked Files

To show hijacked files the following configuration properties exist:

- `clearcase.showHijackedFiles` - to activate the feature
- `clearcase.findHijackedCommandArguments` - the command and its arguments to find hijacked files

The command can be as follows:

- `cleartool ls /vob1 /vob2`

Here it is also possible to use the $CLEARTOOL_AVOBS environment variable. But for the sake of performance it is recommended to limit that search.

## Remote Cleartool Client

It is possible to use the remote cleartool client with VSCode. To activate, set the configuration `vscode-clearcase.remoteCleartool.enable` to `true`. With that set, insert the username to `vscode-clearcase.remoteCleartool.webviewUsername`. When connecting to the server, the password will be requested. It is stored as long as the VSCode window lives. Alternatively there is a setting for storing the password in the configuration `vscode-clearcase.remoteCleartool.webviewPassword`.

## Execution Context

It is possible to change where the exectension is executed. This can be necessary if the
devcontainer feature or a remote ssh connection is used. Often there is no way to have a clearcase environment within the container. Combine this feature with the _wsl.pathMapping_.

To activate the alternative mode you have to add a configuration. Either to your local settings or to the workspace.

```language:json
"remote.extensionKind": {
    "OpenNingia.vscode-clearcase": [ "ui" ]
}
```

This setting has two values:

- **ui** - run the extension in the context of the UI
- **workspace** - run the extension in the workspace context (default).

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

## Logging

It is possible to print the output of the internal clearcase commands into the output console. To control the amount of information that is printed there is a configuration date.

`vscode-clearcase.logLevel` with the Parameter (`Trace`, `Debug`, `Information`, `Warning`,`Error`, `Critical`, `None`)

## Requirements

A valid ClearCase installation within the system's PATH or a valid executable path setup in the **extension** preferences value.

## License

[MIT](LICENSE)

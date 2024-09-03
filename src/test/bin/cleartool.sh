#!/bin/bash

# $@ is all command line parameters passed to the script.
# -o is for short options like -v
# -l is for long options with double dash like --version
# the comma separates different long options
# -a is for long options with single dash like -version
options=$(getopt -l "help,comment:,checkout,checkin,lsvtree,ci,co,nc" -o "h" -a -- "$@")

while true
do
case "$1" in
-h|--help) 
    showHelp
    exit 0
    ;;
-v|--version) 
    shift
    export version="$1"
    ;;
-V|--verbose)
    export verbose=1
    set -xv  # Set xtrace and verbose mode.
    ;;
-r|--rebuild)
    export rebuild=1
    ;;
--)
    shift
    break;;
esac
shift
done



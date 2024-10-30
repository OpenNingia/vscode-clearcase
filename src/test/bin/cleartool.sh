#!/bin/bash

doCheckin=0
doCheckout=0
doUncheckout=0
doNoComment=0
doComment=0
doTree=0
doTreeGrafical=0
doConfigspec=0
doDescribe=0
doListView=0

theComment=""
theFormat=""
theFile=""

usage() {
  echo "cleartool.sh - simulate cleartool for test purpose"
  echo ""
  echo "cleartool.sh [--comment msg|-nc]"
  echo "options:"
  echo "-h, --help      show this message"
  echo "--comment       show this message"
}

checkin() {
  echo "Checked in \"$theFile\" version \"/main/dev_01/2\"."
}

checkout() {
  if [ ! ${theFile#*simple02.txt} ]; then
    # checkin file not found
    error 1
  elif [ ! ${theFile#*simple03.txt} ]; then
    # checkin not checked out
    error 2
  elif [ ! ${theFile#*simple04.txt} ]; then
    # checkout checked out
    error 3
  else
    echo "Checked out \"$theFile\" from version \"/main/dev_01/1\"."
  fi
}

uncheckout() {
  echo "Checkout cancelled for \"$theFile\"."
}

catcs() {
  echo "element * CHECKEDOUT"
  echo ""
  echo "element * /main/0"
}

lsview() {
  echo "Tag: myview"
  echo "Global path: /home/user/viewstore/snapshots/myview.vws"
  echo "Server host: myserver"
  echo "Region: _linux"
  echo "Active: NO"
  echo "View tag uuid:fffffef.eeea1ref.8f3e.00:00:22:11:00:aa"
  echo "View on host: dechezccrh012"
  echo "View server access path: /home/user/viewstore/snapshots/myview.vws"
  echo "View uuid: ffffffe2.123a45ef.eeee.00:90:23:34:3e:cc"
  if [ "$CLEARCASE_TEST_VIEWTYPE" = "DYNAMIC" ]; then
    echo "View attributes: dynamic"
  fi
  if [ "$CLEARCASE_TEST_VIEWTYPE" = "SNAPSHOT" ]; then
    echo "View attributes: snapshot"
  fi
  echo "View owner: server.local/user"
}

error() {
  local state=$1
  if [ $state -eq 1 ]; then # file not found
    echo "cleartool: Error: Unable to access \"$theFile\": No such file or directory."
  elif [ $state -eq 2 ]; then #checkin file not checked out
    echo "cleartool: Error: No branch of element is checked out to view \"myhost:/home/user/viewstore/myview.vws\"."
    echo "cleartool: Error: Unable to find checked out version for \"$theFile\"."
  elif [ $state -eq 3 ]; then #check out already checked out
    echo "cleartool: Error: Element \"$theFile\" is already checked out to view \"myview\"."
  fi
}

# $@ is all command line parameters passed to the script.
# -o is for short options like -v
# -l is for long options with double dash like --version
# the comma separates different long options
# -a is for long options with single dash like -version

# options=$(getopt -l "help,comment:,checkout,checkin,lsvtree" -o "h" -a "nc,fmt:,grafical" "$@")
# eval set -- "$options"

while true; do
  case "$1" in
  -h | --help)
    usage
    exit 0
    ;;
  ci | checkin)
    doCheckin=1
    ;;
  co | checkout)
    doCheckout=1
    ;;
  unco | uncheckout)
    doUncheckout=1
    ;;
  lsvtree)
    doTree=1
    ;;
  unco | uncheckout)
    doCheckout=1
    ;;
  catcs)
    doConfigspec=1
    ;;
  lsview)
    doListView=1
    ;;
  -nc)
    doNoComment=1
    ;;
  -grahpical)
    doTreeGrafical=1
    ;;
  --comment)
    shift
    theComment="$1"
    doComment=1
    ;;
  -fmt)
    shift
    theFormat="$1"
    ;;
  *)
    theFile="$1"
    ;;
  --)
    shift
    break
    ;;
  esac
  shift
  if [ $# -eq 0 ]; then
    break
  fi
done

if [ $doCheckin -eq 1 ]; then
  checkin
elif [ $doCheckout -eq 1 ]; then
  checkout
elif [ $doUncheckout -eq 1 ]; then
  uncheckout
elif [ $doConfigspec -eq 1 ]; then
  catcs
elif [ $doListView -eq 1 ]; then
  lsview
fi

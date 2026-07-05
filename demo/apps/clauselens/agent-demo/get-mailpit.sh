#!/bin/sh
# Downloads the Mailpit single binary (pinned) into .tools/ (gitignored).
# Mailpit is the LOCAL mail catcher: SMTP on localhost:1025, inbox UI on
# http://localhost:8025. It accepts mail to the fictional .test addresses and
# never relays anything outward.
set -eu
cd "$(dirname "$0")"
mkdir -p .tools
if [ -x .tools/mailpit ]; then
  echo "Mailpit already present: $(.tools/mailpit version 2>/dev/null || echo ok)"
  exit 0
fi
VERSION="v1.27.10"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) SUFFIX="darwin-arm64" ;;
  x86_64) SUFFIX="darwin-amd64" ;;
  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac
URL="https://github.com/axllent/mailpit/releases/download/${VERSION}/mailpit-${SUFFIX}.tar.gz"
echo "Downloading Mailpit ${VERSION} (${SUFFIX})..."
curl -sSL "$URL" -o .tools/mailpit.tar.gz
tar -xzf .tools/mailpit.tar.gz -C .tools mailpit
rm .tools/mailpit.tar.gz
chmod +x .tools/mailpit
echo "Installed: $(.tools/mailpit version)"

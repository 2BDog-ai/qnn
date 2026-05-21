#!/bin/bash

# Wedding Music Player - silent macOS launch repair.

set -u

APP_NAME="WeddingMusicPlayer.app"
APP_PATH=""

for base in "/Applications" "$HOME/Applications" "$(dirname "$0")/.."; do
  if [[ -d "$base/$APP_NAME" ]]; then
    APP_PATH="$base/$APP_NAME"
    break
  fi
done

if [[ -z "$APP_PATH" ]]; then
  exit 0
fi

xattr -cr "$APP_PATH" 2>/dev/null || true
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true
chmod -R +x "$APP_PATH/Contents/MacOS" 2>/dev/null || true
codesign --force --deep --sign - "$APP_PATH" 2>/dev/null || true
open "$APP_PATH"

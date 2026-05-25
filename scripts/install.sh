#!/bin/bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAMES=(
  "WeddingMusicPlayer.app"
  "Wedding Music Player.app"
)

info() { printf '\033[0;34m%s\033[0m\n' "$1"; }
ok() { printf '\033[0;32m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }
fail() { printf '\033[0;31m%s\033[0m\n' "$1"; }

pause_exit() {
  echo ""
  read -r -p "Press Enter to exit..." _
}

find_source_app() {
  for name in "${APP_NAMES[@]}"; do
    if [[ -d "$SCRIPT_DIR/$name" ]]; then
      printf '%s\n' "$SCRIPT_DIR/$name"
      return 0
    fi
    if [[ -d "$SCRIPT_DIR/../$name" ]]; then
      printf '%s\n' "$SCRIPT_DIR/../$name"
      return 0
    fi
  done
  return 1
}

echo "=================================================="
echo "Wedding Music Player - macOS Install"
echo "=================================================="
echo ""
echo "Apple Silicon M1/M2/M3/M4: use mac-arm64.dmg"
echo "Intel Mac: use mac-x64.dmg"
echo ""

if [[ "$(uname)" != "Darwin" ]]; then
  fail "This helper only runs on macOS."
  pause_exit
  exit 1
fi

if ! SOURCE_APP="$(find_source_app)"; then
  fail "WeddingMusicPlayer.app was not found. Open the DMG first, then run this script."
  pause_exit
  exit 1
fi

APP_BASENAME="$(basename "$SOURCE_APP")"
TARGET_APP="/Applications/$APP_BASENAME"

info "Installing to /Applications..."
rm -rf "$TARGET_APP" 2>/dev/null || sudo rm -rf "$TARGET_APP"
cp -R "$SOURCE_APP" "$TARGET_APP" 2>/dev/null || sudo cp -R "$SOURCE_APP" "$TARGET_APP"

info "Removing macOS quarantine attributes..."
xattr -cr "$TARGET_APP" 2>/dev/null || sudo xattr -cr "$TARGET_APP"
xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || sudo xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true

if [[ -d "$TARGET_APP/Contents/MacOS" ]]; then
  chmod -R +x "$TARGET_APP/Contents/MacOS" 2>/dev/null || sudo chmod -R +x "$TARGET_APP/Contents/MacOS"
fi

ok "Install finished."
info "Opening app..."
open "$TARGET_APP" || warn "If it does not open, right-click WeddingMusicPlayer in Applications and choose Open."

pause_exit

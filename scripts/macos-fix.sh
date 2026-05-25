#!/bin/bash

set -u

APP_NAMES=(
  "WeddingMusicPlayer.app"
  "Wedding Music Player.app"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info() { printf '\033[0;34m%s\033[0m\n' "$1"; }
ok() { printf '\033[0;32m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }
fail() { printf '\033[0;31m%s\033[0m\n' "$1"; }

pause_exit() {
  echo ""
  read -r -p "Press Enter to exit..." _
}

normalize_dragged_path() {
  local raw="$1"
  raw="${raw%$'\r'}"
  raw="${raw#\"}"
  raw="${raw%\"}"
  raw="${raw#\'}"
  raw="${raw%\'}"
  printf '%b' "${raw//\\ / }"
}

find_app() {
  local bases=(
    "/Applications"
    "$HOME/Applications"
    "$HOME/Desktop"
    "$HOME/Downloads"
    "$SCRIPT_DIR"
    "$SCRIPT_DIR/.."
  )

  for base in "${bases[@]}"; do
    for name in "${APP_NAMES[@]}"; do
      if [[ -d "$base/$name" ]]; then
        printf '%s\n' "$base/$name"
        return 0
      fi
    done
  done

  return 1
}

copy_from_dmg_if_needed() {
  for name in "${APP_NAMES[@]}"; do
    local source_app="$SCRIPT_DIR/$name"
    if [[ -d "$source_app" && "$source_app" == /Volumes/* ]]; then
      local target_app="/Applications/$name"
      printf '%s\n' "Copying app from DMG to /Applications..." >&2
      rm -rf "$target_app" 2>/dev/null || sudo rm -rf "$target_app"
      cp -R "$source_app" "$target_app" 2>/dev/null || sudo cp -R "$source_app" "$target_app"
      printf '%s\n' "$target_app"
      return 0
    fi
  done

  return 1
}

repair_app() {
  local app_path="$1"

  if [[ ! -d "$app_path" ]]; then
    fail "App path does not exist: $app_path"
    return 1
  fi

  info "Repairing: $app_path"
  xattr -cr "$app_path" 2>/dev/null || sudo xattr -cr "$app_path"
  xattr -dr com.apple.quarantine "$app_path" 2>/dev/null || sudo xattr -dr com.apple.quarantine "$app_path" 2>/dev/null || true

  if [[ -d "$app_path/Contents/MacOS" ]]; then
    chmod -R +x "$app_path/Contents/MacOS" 2>/dev/null || sudo chmod -R +x "$app_path/Contents/MacOS"
  fi

  find "$app_path" -name "*.dylib" -exec chmod 755 {} \; 2>/dev/null || true
  spctl --add "$app_path" 2>/dev/null || true

  ok "Repair finished."
}

echo "=================================================="
echo "Wedding Music Player - macOS Repair"
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

APP_PATH=""

if copied_app="$(copy_from_dmg_if_needed 2>/dev/null)"; then
  APP_PATH="$copied_app"
elif found_app="$(find_app 2>/dev/null)"; then
  APP_PATH="$found_app"
else
  warn "WeddingMusicPlayer.app was not found automatically."
  echo "Drag WeddingMusicPlayer.app into this window, then press Enter:"
  read -r dragged_path
  APP_PATH="$(normalize_dragged_path "$dragged_path")"
fi

repair_app "$APP_PATH"

echo ""
info "Opening app..."
open "$APP_PATH" || warn "If it does not open, right-click the app in /Applications and choose Open."

echo ""
echo "If macOS still blocks it, run this in Terminal:"
echo "sudo xattr -cr \"$APP_PATH\""
echo ""
pause_exit

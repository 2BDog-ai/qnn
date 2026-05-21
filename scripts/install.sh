#!/bin/bash

# Wedding Music Player - macOS installer helper.

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
  read -r -p "按回车键退出..." _
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
echo "Wedding Music Player - macOS 安装工具"
echo "=================================================="
echo ""

if [[ "$(uname)" != "Darwin" ]]; then
  fail "这个工具只能在 macOS 上运行。"
  pause_exit
  exit 1
fi

if ! SOURCE_APP="$(find_source_app)"; then
  fail "没有找到 WeddingMusicPlayer.app。请先打开 DMG，再运行这个脚本。"
  pause_exit
  exit 1
fi

APP_BASENAME="$(basename "$SOURCE_APP")"
TARGET_APP="/Applications/$APP_BASENAME"

info "正在安装到 /Applications..."
rm -rf "$TARGET_APP" 2>/dev/null || sudo rm -rf "$TARGET_APP"
cp -R "$SOURCE_APP" "$TARGET_APP" 2>/dev/null || sudo cp -R "$SOURCE_APP" "$TARGET_APP"

info "正在解除 macOS 隔离限制..."
xattr -cr "$TARGET_APP" 2>/dev/null || sudo xattr -cr "$TARGET_APP"
xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || sudo xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true

if [[ -d "$TARGET_APP/Contents/MacOS" ]]; then
  chmod -R +x "$TARGET_APP/Contents/MacOS" 2>/dev/null || sudo chmod -R +x "$TARGET_APP/Contents/MacOS"
fi

codesign --force --deep --sign - "$TARGET_APP" 2>/dev/null || sudo codesign --force --deep --sign - "$TARGET_APP" 2>/dev/null || true

ok "安装和修复完成。"
info "正在打开应用..."
open "$TARGET_APP" || warn "如果没有自动打开，请到“应用程序”里右键 WeddingMusicPlayer，选择“打开”。"

pause_exit

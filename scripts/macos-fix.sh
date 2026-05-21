#!/bin/bash

# Wedding Music Player - macOS repair helper.
# Fixes the common "app is damaged and cannot be opened" Gatekeeper/quarantine issue.

set -u

APP_NAMES=(
  "WeddingMusicPlayer.app"
  "Wedding Music Player.app"
  "艺语音乐播放器.app"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info() { printf '\033[0;34m%s\033[0m\n' "$1"; }
ok() { printf '\033[0;32m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }
fail() { printf '\033[0;31m%s\033[0m\n' "$1"; }

pause_exit() {
  echo ""
  read -r -p "按回车键退出..." _
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
      info "检测到应用还在 DMG 中，正在复制到 /Applications..."
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
    fail "应用路径不存在: $app_path"
    return 1
  fi

  info "正在修复: $app_path"

  xattr -cr "$app_path" 2>/dev/null || sudo xattr -cr "$app_path"
  xattr -dr com.apple.quarantine "$app_path" 2>/dev/null || sudo xattr -dr com.apple.quarantine "$app_path" 2>/dev/null || true

  if [[ -d "$app_path/Contents/MacOS" ]]; then
    chmod -R +x "$app_path/Contents/MacOS" 2>/dev/null || sudo chmod -R +x "$app_path/Contents/MacOS"
  fi

  find "$app_path" -name "*.dylib" -exec chmod 755 {} \; 2>/dev/null || true

  info "正在重新签名..."
  codesign --force --deep --sign - "$app_path" 2>/dev/null || sudo codesign --force --deep --sign - "$app_path" 2>/dev/null || true

  spctl --add "$app_path" 2>/dev/null || true

  ok "修复完成。"
}

echo "=================================================="
echo "Wedding Music Player - macOS 一键修复工具"
echo "=================================================="
echo ""

if [[ "$(uname)" != "Darwin" ]]; then
  fail "这个工具只能在 macOS 上运行。"
  pause_exit
  exit 1
fi

APP_PATH=""

if copied_app="$(copy_from_dmg_if_needed 2>/dev/null)"; then
  APP_PATH="$copied_app"
elif found_app="$(find_app 2>/dev/null)"; then
  APP_PATH="$found_app"
else
  warn "没有自动找到 WeddingMusicPlayer.app。"
  echo "请把 WeddingMusicPlayer.app 拖到这个窗口里，然后按回车："
  read -r dragged_path
  APP_PATH="$(normalize_dragged_path "$dragged_path")"
fi

repair_app "$APP_PATH"

echo ""
info "现在尝试打开应用..."
open "$APP_PATH" || warn "如果没有自动打开，请到 /Applications 里右键应用，选择“打开”。"

echo ""
echo "如果仍然提示已损坏，请在终端执行："
echo "sudo xattr -cr \"$APP_PATH\""
echo ""
pause_exit

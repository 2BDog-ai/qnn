#!/bin/bash

# 艺语音乐播放器 - 预启动修复脚本
# 这个脚本会在应用启动前自动执行，确保权限问题得到解决

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[预启动修复] $1${NC}"; }
log_success() { echo -e "${GREEN}[预启动修复] ✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}[预启动修复] ⚠️  $1${NC}"; }
log_error() { echo -e "${RED}[预启动修复] ❌ $1${NC}"; }

# 获取应用路径
APP_NAME="艺语音乐播放器.app"
POSSIBLE_PATHS=(
    "/Applications/$APP_NAME"
    "$HOME/Applications/$APP_NAME"
    "$(dirname "$0")/../$APP_NAME"
)

APP_PATH=""
for path in "${POSSIBLE_PATHS[@]}"; do
    if [[ -d "$path" ]]; then
        APP_PATH="$path"
        break
    fi
done

if [[ -z "$APP_PATH" ]]; then
    log_error "未找到应用，预启动修复跳过"
    exit 0
fi

log_info "找到应用: $APP_PATH"

# 静默执行修复（不显示详细输出）
{
    # 移除隔离属性
    xattr -cr "$APP_PATH" 2>/dev/null || true
    xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true
    find "$APP_PATH" -exec xattr -c {} \; 2>/dev/null || true
    
    # 设置权限
    chmod -R +x "$APP_PATH/Contents/MacOS/" 2>/dev/null || true
    
    # 重新签名
    codesign --force --deep --sign - "$APP_PATH" 2>/dev/null || true
    
    # 添加到信任列表
    spctl --add "$APP_PATH" 2>/dev/null || true
    spctl --enable "$APP_PATH" 2>/dev/null || true
    
} && log_success "预启动修复完成" || log_warning "预启动修复部分失败"

# 启动应用
log_info "启动应用..."
open "$APP_PATH"

#!/bin/bash

# 艺语音乐播放器 - 自动安装脚本
# 版本: 1.0.0

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo "=================================================="
echo "🎵 艺语音乐播放器 - 自动安装程序"
echo "=================================================="
echo ""

# 检查系统
if [[ "$OSTYPE" != "darwin"* ]]; then
    log_error "此安装程序仅适用于 macOS 系统"
    exit 1
fi

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="艺语音乐播放器.app"

# 查找应用包
if [[ -d "$SCRIPT_DIR/../$APP_NAME" ]]; then
    SOURCE_APP="$SCRIPT_DIR/../$APP_NAME"
elif [[ -d "$SCRIPT_DIR/$APP_NAME" ]]; then
    SOURCE_APP="$SCRIPT_DIR/$APP_NAME"
else
    log_error "未找到应用包: $APP_NAME"
    exit 1
fi

log_info "找到应用包: $SOURCE_APP"

# 目标安装路径
TARGET_DIR="/Applications"
TARGET_APP="$TARGET_DIR/$APP_NAME"

# 检查是否需要管理员权限
if [[ ! -w "$TARGET_DIR" ]]; then
    log_warning "需要管理员权限安装到 /Applications"
    USE_SUDO=true
else
    USE_SUDO=false
fi

# 安装应用
log_info "正在安装应用到 $TARGET_DIR..."

if [[ -d "$TARGET_APP" ]]; then
    log_warning "检测到已安装的版本，正在备份..."
    if $USE_SUDO; then
        sudo mv "$TARGET_APP" "$TARGET_APP.backup.$(date +%s)" 2>/dev/null || true
    else
        mv "$TARGET_APP" "$TARGET_APP.backup.$(date +%s)" 2>/dev/null || true
    fi
fi

# 复制应用
if $USE_SUDO; then
    if sudo cp -R "$SOURCE_APP" "$TARGET_DIR/"; then
        log_success "应用安装成功"
    else
        log_error "应用安装失败"
        exit 1
    fi
else
    if cp -R "$SOURCE_APP" "$TARGET_DIR/"; then
        log_success "应用安装成功"
    else
        log_error "应用安装失败"
        exit 1
    fi
fi

# 自动修复权限问题
log_info "正在自动修复系统兼容性问题..."

# 移除隔离属性
log_info "移除隔离属性..."
if $USE_SUDO; then
    sudo xattr -cr "$TARGET_APP" 2>/dev/null || true
    sudo xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true
else
    xattr -cr "$TARGET_APP" 2>/dev/null || true
    xattr -dr com.apple.quarantine "$TARGET_APP" 2>/dev/null || true
fi

# 设置执行权限
log_info "设置执行权限..."
if $USE_SUDO; then
    sudo chmod -R +x "$TARGET_APP/Contents/MacOS/" 2>/dev/null || true
else
    chmod -R +x "$TARGET_APP/Contents/MacOS/" 2>/dev/null || true
fi

# 代码签名
log_info "修复代码签名..."
codesign --force --deep --sign - "$TARGET_APP" 2>/dev/null || log_warning "代码签名失败，但不影响使用"

# 添加到信任列表
log_info "添加到系统信任列表..."
spctl --add "$TARGET_APP" 2>/dev/null || log_warning "添加到信任列表失败"
spctl --enable "$TARGET_APP" 2>/dev/null || true

log_success "系统兼容性修复完成"

# 创建桌面快捷方式
echo ""
echo -n "是否在桌面创建快捷方式？(y/N): "
read -r create_shortcut
case "$create_shortcut" in
    [yY][eE][sS]|[yY])
        if ln -sf "$TARGET_APP" "$HOME/Desktop/$APP_NAME" 2>/dev/null; then
            log_success "桌面快捷方式创建成功"
        else
            log_warning "桌面快捷方式创建失败"
        fi
        ;;
esac

# 询问是否立即启动
echo ""
echo -n "是否现在启动艺语音乐播放器？(Y/n): "
read -r launch_app
case "$launch_app" in
    [nN][oO]|[nN])
        log_info "安装完成！您可以在应用程序文件夹中找到艺语音乐播放器"
        ;;
    *)
        log_info "正在启动应用..."
        if open "$TARGET_APP"; then
            log_success "应用启动成功！"
        else
            log_error "应用启动失败"
            echo ""
            log_info "如果遇到问题，请："
            echo "1. 在系统偏好设置 → 安全性与隐私中允许应用运行"
            echo "2. 右键点击应用选择'打开'"
            echo "3. 运行修复工具: $SCRIPT_DIR/macos-fix.sh"
        fi
        ;;
esac

echo ""
echo "=================================================="
echo "🎉 安装完成！"
echo "=================================================="
echo "应用位置: $TARGET_APP"
echo "如有问题，请运行修复工具或联系技术支持"
echo ""

#!/bin/bash

# 艺语音乐播放器 - macOS 兼容性修复工具
# 版本: 1.0.0
# 用途: 自动修复 macOS 安全限制问题

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
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

# 显示标题
echo "=================================================="
echo "🎵 艺语音乐播放器 - macOS 兼容性修复工具"
echo "=================================================="
echo ""

# 检查是否为 macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    log_error "此工具仅适用于 macOS 系统"
    exit 1
fi

# 查找应用程序
APP_NAME="艺语音乐播放器.app"
POSSIBLE_PATHS=(
    "/Applications/$APP_NAME"
    "$HOME/Applications/$APP_NAME"
    "$HOME/Desktop/$APP_NAME"
    "$HOME/Downloads/$APP_NAME"
    "$(dirname "$0")/../$APP_NAME"
)

APP_PATH=""
for path in "${POSSIBLE_PATHS[@]}"; do
    if [[ -d "$path" ]]; then
        APP_PATH="$path"
        break
    fi
done

# 如果没找到，让用户选择
if [[ -z "$APP_PATH" ]]; then
    log_warning "未找到艺语音乐播放器应用"
    echo "请将应用拖拽到此窗口，然后按回车："
    read -r APP_PATH
    APP_PATH=$(echo "$APP_PATH" | sed 's/^[ \t]*//;s/[ \t]*$//')  # 去除前后空格
fi

# 验证应用路径
if [[ ! -d "$APP_PATH" ]]; then
    log_error "应用路径无效: $APP_PATH"
    exit 1
fi

log_info "找到应用: $APP_PATH"
echo ""

# 检查当前用户权限
if [[ $EUID -eq 0 ]]; then
    log_warning "检测到以 root 用户运行，建议使用普通用户运行此脚本"
fi

# 修复函数
fix_quarantine() {
    log_info "正在移除隔离属性..."
    
    # 尝试多种方法移除隔离属性
    local success=false
    
    # 方法1: 直接移除
    if xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null; then
        success=true
    fi
    
    # 方法2: 递归移除
    if xattr -cr "$APP_PATH" 2>/dev/null; then
        success=true
    fi
    
    # 方法3: 查找并移除所有文件的隔离属性
    find "$APP_PATH" -exec xattr -d com.apple.quarantine {} \; 2>/dev/null || true
    
    if $success; then
        log_success "隔离属性移除成功"
    else
        log_warning "隔离属性移除可能需要管理员权限"
        if ask_permission "是否尝试使用 sudo 权限移除隔离属性？"; then
            if sudo xattr -cr "$APP_PATH" 2>/dev/null; then
                log_success "隔离属性移除成功 (使用 sudo)"
            else
                log_error "隔离属性移除失败"
            fi
        fi
    fi
}

fix_code_signature() {
    log_info "正在修复代码签名..."
    
    if codesign --force --deep --sign - "$APP_PATH" 2>/dev/null; then
        log_success "代码签名修复成功"
    else
        log_warning "代码签名修复失败，但不影响正常使用"
    fi
}

fix_permissions() {
    log_info "正在设置执行权限..."
    
    if chmod -R +x "$APP_PATH/Contents/MacOS/" 2>/dev/null; then
        log_success "执行权限设置成功"
    else
        log_warning "执行权限设置失败"
    fi
}

fix_gatekeeper() {
    log_info "正在添加到系统信任列表..."
    
    # 尝试添加到 Gatekeeper 白名单
    if spctl --add "$APP_PATH" 2>/dev/null && spctl --enable "$APP_PATH" 2>/dev/null; then
        log_success "已添加到系统信任列表"
    else
        log_warning "添加到信任列表失败，可能需要在系统偏好设置中手动允许"
    fi
}

# 询问用户权限
ask_permission() {
    local question="$1"
    echo -n "$question (y/N): "
    read -r response
    case "$response" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

# 检查系统版本
check_macos_version() {
    local version=$(sw_vers -productVersion)
    local major_version=$(echo "$version" | cut -d. -f1)
    local minor_version=$(echo "$version" | cut -d. -f2)
    
    log_info "检测到 macOS 版本: $version"
    
    if [[ $major_version -ge 11 ]] || ([[ $major_version -eq 10 ]] && [[ $minor_version -ge 15 ]]); then
        log_warning "检测到较新的 macOS 版本，安全限制可能更严格"
        return 0
    fi
    
    return 1
}

# 主修复流程
main_fix() {
    echo "开始修复过程..."
    echo ""
    
    # 检查系统版本
    check_macos_version
    echo ""
    
    # 执行修复步骤
    fix_quarantine
    echo ""
    
    fix_code_signature
    echo ""
    
    fix_permissions
    echo ""
    
    fix_gatekeeper
    echo ""
    
    log_success "所有修复步骤已完成！"
}

# 测试应用启动
test_launch() {
    if ask_permission "是否现在测试启动应用？"; then
        log_info "正在启动应用..."
        if open "$APP_PATH"; then
            log_success "应用启动成功！"
        else
            log_error "应用启动失败"
            echo ""
            log_info "如果问题仍然存在，请尝试以下方法："
            echo "1. 在系统偏好设置 → 安全性与隐私 → 通用中点击'仍要打开'"
            echo "2. 右键点击应用 → 打开"
            echo "3. 联系技术支持"
        fi
    fi
}

# 创建桌面快捷方式
create_desktop_shortcut() {
    if ask_permission "是否在桌面创建快捷方式？"; then
        local shortcut_path="$HOME/Desktop/艺语音乐播放器.app"
        if ln -sf "$APP_PATH" "$shortcut_path" 2>/dev/null; then
            log_success "桌面快捷方式创建成功"
        else
            log_warning "桌面快捷方式创建失败"
        fi
    fi
}

# 显示使用建议
show_tips() {
    echo ""
    echo "=================================================="
    echo "💡 使用建议"
    echo "=================================================="
    echo "1. 如果应用仍然无法启动，请重启电脑后再试"
    echo "2. 确保从官方渠道下载应用程序"
    echo "3. 定期更新 macOS 系统以获得最佳兼容性"
    echo "4. 如有问题，请联系技术支持"
    echo ""
}

# 主程序
main() {
    # 执行主修复流程
    main_fix
    echo ""
    
    # 测试启动
    test_launch
    echo ""
    
    # 创建快捷方式
    create_desktop_shortcut
    echo ""
    
    # 显示使用建议
    show_tips
    
    echo "🎉 修复完成！感谢使用艺语音乐播放器"
    echo ""
    
    # 保持窗口打开
    if ask_permission "按回车键退出"; then
        exit 0
    fi
}

# 错误处理
trap 'log_error "修复过程中出现错误"; exit 1' ERR

# 运行主程序
main

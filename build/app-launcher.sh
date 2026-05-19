#!/bin/bash

# 艺语音乐播放器 - 智能启动器
# 自动检测并清除证书验证问题

APP_NAME="艺语音乐播放器"
APP_PATH="/Applications/${APP_NAME}.app"

# 静默检查和修复函数
check_and_fix() {
    # 检查是否有隔离属性
    if xattr -l "$APP_PATH" 2>/dev/null | grep -q "com.apple.quarantine"; then
        # 尝试静默清除
        xattr -d com.apple.quarantine "$APP_PATH" 2>/dev/null
        # 如果还有其他扩展属性，清除所有
        if xattr -l "$APP_PATH" 2>/dev/null | grep -q ":"; then
            xattr -cr "$APP_PATH" 2>/dev/null
        fi
    fi
}

# 主启动逻辑
main() {
    # 检查应用是否存在
    if [ ! -d "$APP_PATH" ]; then
        echo "未找到应用程序: $APP_PATH"
        exit 1
    fi
    
    # 尝试自动修复
    check_and_fix
    
    # 启动应用
    open "$APP_PATH"
}

# 执行主逻辑
main "$@"

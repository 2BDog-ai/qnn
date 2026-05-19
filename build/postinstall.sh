#!/bin/bash

# macOS 应用安装后自动清理脚本
# 用于移除 Gatekeeper 隔离属性

APP_PATH="/Applications/艺语音乐播放器.app"
SCRIPT_NAME="艺语音乐播放器安装助手"

echo "正在优化应用兼容性..."

# 检查应用是否存在
if [ -d "$APP_PATH" ]; then
    echo "找到应用: $APP_PATH"
    
    # 移除隔离属性
    echo "正在移除安全限制..."
    xattr -cr "$APP_PATH" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ 应用兼容性优化完成"
        echo "您现在可以正常使用艺语音乐播放器了"
        
        # 显示成功通知
        osascript -e 'display notification "艺语音乐播放器已准备就绪！" with title "安装完成" sound name "Glass"'
    else
        echo "⚠️  需要管理员权限来优化应用"
        echo "请手动执行: sudo xattr -cr '$APP_PATH'"
        
        # 显示需要权限的提示
        osascript -e 'display dialog "需要管理员权限来完成应用优化\n\n请在终端中执行:\nsudo xattr -cr /Applications/艺语音乐播放器.app" with title "需要权限" buttons {"知道了"} default button 1 with icon caution'
    fi
else
    echo "❌ 未找到应用，请确保已正确安装到 Applications 文件夹"
    
    # 显示安装指引
    osascript -e 'display dialog "请将艺语音乐播放器拖拽到 Applications 文件夹中" with title "安装提示" buttons {"知道了"} default button 1 with icon note'
fi

echo "安装助手执行完成"

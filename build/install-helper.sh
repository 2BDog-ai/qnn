#!/bin/bash

# 艺语音乐播放器 - 安装助手
# 自动处理 macOS 证书验证问题

APP_NAME="艺语音乐播放器"
APP_PATH="/Applications/${APP_NAME}.app"

echo "========================================"
echo "       艺语音乐播放器 - 安装助手"
echo "========================================"
echo ""

# 检查是否以管理员权限运行
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  请不要使用 sudo 运行此脚本"
    echo "   正常双击运行即可"
    echo ""
    exit 1
fi

# 显示欢迎信息
echo "🎵 欢迎使用艺语音乐播放器！"
echo ""
echo "正在为您配置应用程序..."
echo ""

# 检查应用是否已安装
if [ ! -d "$APP_PATH" ]; then
    echo "❌ 未找到应用程序"
    echo "   请先将 ${APP_NAME}.app 拖拽到 Applications 文件夹"
    echo ""
    read -p "按 Enter 键退出..."
    exit 1
fi

echo "✅ 已找到应用程序: $APP_PATH"

# 请求权限说明
echo ""
echo "🔐 正在优化应用兼容性..."
echo "   （需要输入您的 Mac 密码以清除安全限制）"
echo ""

# 执行清除扩展属性命令
if sudo xattr -cr "$APP_PATH" 2>/dev/null; then
    echo "✅ 兼容性优化完成！"
    echo ""
    echo "🎉 安装成功！"
    echo ""
    echo "现在您可以："
    echo "• 从 Launchpad 启动应用"
    echo "• 从 Applications 文件夹启动"
    echo "• 将应用固定到 Dock"
    echo ""
    
    # 询问是否立即启动
    echo "是否立即启动应用？(y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "正在启动应用..."
        open "$APP_PATH"
    fi
else
    echo "❌ 兼容性优化失败"
    echo ""
    echo "手动解决方案："
    echo "1. 打开终端（Terminal）"
    echo "2. 输入以下命令："
    echo "   xattr -cr '$APP_PATH'"
    echo "3. 输入密码并按回车"
    echo ""
fi

echo ""
echo "感谢使用艺语音乐播放器！"
echo ""
read -p "按 Enter 键退出..."


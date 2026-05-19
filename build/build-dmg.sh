#!/bin/bash

# 艺语音乐播放器 - DMG 打包脚本（包含安装助手）

APP_NAME="艺语音乐播放器"
APP_PATH="dist/mac-arm64/${APP_NAME}.app"
DMG_NAME="${APP_NAME}-installer.dmg"
VOLUME_NAME="${APP_NAME}"

echo "开始创建 DMG 安装包..."

# 检查应用是否存在
if [ ! -d "$APP_PATH" ]; then
    echo "错误: 找不到应用 $APP_PATH"
    echo "请先运行 npm run build:mac 构建应用"
    exit 1
fi

# 删除旧的 DMG
rm -f "$DMG_NAME"

# 创建临时目录
TEMP_DIR=$(mktemp -d)
mkdir -p "$TEMP_DIR"

echo "正在准备安装包内容..."

# 复制应用到临时目录
cp -R "$APP_PATH" "$TEMP_DIR/"

# 创建 Applications 链接
ln -s /Applications "$TEMP_DIR/Applications"

# 复制安装助手到 DMG
cp "install-helper.sh" "$TEMP_DIR/🔧 安装助手.command"
chmod +x "$TEMP_DIR/🔧 安装助手.command"

# 复制应用启动器（可选）
cp "app-launcher.sh" "$TEMP_DIR/🚀 启动应用.command"
chmod +x "$TEMP_DIR/🚀 启动应用.command"

# 创建说明文件
cat > "$TEMP_DIR/📖 安装说明.txt" << EOF
艺语音乐播放器 - 安装说明

🎵 欢迎使用艺语音乐播放器！

📦 安装步骤：
1. 将「${APP_NAME}.app」拖拽到「Applications」文件夹
2. 双击「🔧 安装助手.command」优化兼容性
3. 启动应用开始使用

⚠️  重要提醒：
• 如果应用无法打开，请务必运行「安装助手」
• 安装助手会自动清除 macOS 的安全限制
• 此操作完全安全，不会损害您的系统

🚀 快速启动：
• 您也可以使用「🚀 启动应用.command」快速启动
• 此启动器会自动处理兼容性问题

💡 技术说明：
由于应用未经过 Apple 官方签名认证，macOS 会默认阻止运行。
安装助手通过执行 "xattr -cr" 命令清除隔离属性，这是标准的解决方案。

感谢您的使用！
EOF

echo "正在创建 DMG 文件..."

# 创建 DMG
hdiutil create -volname "$VOLUME_NAME" \
    -srcfolder "$TEMP_DIR" \
    -ov \
    -format UDZO \
    "$DMG_NAME"

# 清理临时目录
rm -rf "$TEMP_DIR"

echo ""
echo "✅ DMG 创建完成: $DMG_NAME"
echo "📦 文件大小: $(ls -lh "$DMG_NAME" | awk '{print $5}')"
echo ""
echo "🎉 安装包内容："
echo "   • ${APP_NAME}.app - 主应用程序"
echo "   • Applications - 应用程序文件夹链接"
echo "   • 🔧 安装助手.command - 自动优化兼容性"
echo "   • 🚀 启动应用.command - 智能启动器"
echo "   • 📖 安装说明.txt - 详细说明文档"
echo ""
echo "📋 用户使用流程："
echo "1. 打开 DMG"
echo "2. 拖拽应用到 Applications"
echo "3. 双击安装助手优化兼容性"
echo "4. 正常使用应用"

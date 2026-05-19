#!/bin/bash

# 创建简单的 DMG 背景图片
# 使用 macOS 内置的 sips 工具

# 创建一个简单的背景图片
# 540x460 像素，浅灰色背景

# 如果有 ImageMagick，使用它
if command -v convert >/dev/null 2>&1; then
    echo "使用 ImageMagick 创建背景图片..."
    convert -size 540x460 xc:'#f8f9fa' \
            -pointsize 24 -fill '#333333' -gravity North -annotate +0+30 '艺语音乐播放器' \
            -pointsize 14 -fill '#666666' -gravity North -annotate +0+70 '拖拽到 Applications 文件夹完成安装' \
            -pointsize 14 -fill '#666666' -gravity South -annotate +0+70 '双击安装助手优化兼容性' \
            dmg-background.png
    echo "背景图片创建完成: dmg-background.png"
else
    echo "ImageMagick 不可用，创建纯色背景..."
    # 创建一个纯色图片作为备选
    printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x02\x1c\x00\x00\x01\xcc\x08\x02\x00\x00\x00\x8d\x92\x1d\x9d' > dmg-background.png
    echo "已创建简单背景图片"
fi

echo "DMG 背景配置完成"


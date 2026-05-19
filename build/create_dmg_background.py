#!/usr/bin/env python3
"""
创建 DMG 背景图片
"""
import os
from PIL import Image, ImageDraw, ImageFont

def create_dmg_background():
    # 创建图片
    width, height = 540, 460
    image = Image.new('RGB', (width, height), '#f8f9fa')
    draw = ImageDraw.Draw(image)
    
    # 添加渐变背景效果
    for y in range(height):
        r = int(248 + (255-248) * y / height)
        g = int(249 + (255-249) * y / height)  
        b = int(250 + (255-250) * y / height)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    
    # 添加标题
    try:
        # 尝试使用系统字体
        title_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
        subtitle_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
    except:
        # 如果系统字体不可用，使用默认字体
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()
    
    # 标题文本
    title = "艺语音乐播放器"
    subtitle = "拖拽到 Applications 文件夹完成安装"
    helper_text = "双击安装助手优化兼容性"
    
    # 绘制标题
    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_width = title_bbox[2] - title_bbox[0]
    draw.text(((width - title_width) // 2, 30), title, fill='#333333', font=title_font)
    
    # 绘制副标题
    subtitle_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    subtitle_width = subtitle_bbox[2] - subtitle_bbox[0]
    draw.text(((width - subtitle_width) // 2, 70), subtitle, fill='#666666', font=subtitle_font)
    
    # 绘制安装助手说明
    helper_bbox = draw.textbbox((0, 0), helper_text, font=subtitle_font)
    helper_width = helper_bbox[2] - helper_bbox[0]
    draw.text(((width - helper_width) // 2, 390), helper_text, fill='#666666', font=subtitle_font)
    
    # 绘制箭头指示
    # 从应用图标位置到 Applications 的箭头
    arrow_start = (210, 240)
    arrow_end = (330, 240)
    draw.line([arrow_start, arrow_end], fill='#007AFF', width=3)
    # 箭头头部
    draw.polygon([
        (arrow_end[0], arrow_end[1]),
        (arrow_end[0] - 10, arrow_end[1] - 5),
        (arrow_end[0] - 10, arrow_end[1] + 5)
    ], fill='#007AFF')
    
    # 保存图片
    output_path = os.path.join(os.path.dirname(__file__), 'dmg-background.png')
    image.save(output_path, 'PNG')
    print(f"DMG 背景图片已创建: {output_path}")

if __name__ == "__main__":
    create_dmg_background()


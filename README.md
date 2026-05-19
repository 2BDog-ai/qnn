# 婚礼音乐播放器

一款专为婚礼主持人设计的专业音乐播放软件，支持现场音乐播放、音频编辑、录音等功能。

## 🎵 功能特性

### 核心功能
- **音乐播放**：支持MP3、WAV、FLAC、M4A、AAC等格式
- **播放列表管理**：创建、编辑、删除播放列表
- **音频编辑**：转码、剪辑、波形编辑
- **人声消除**：中央声道消除算法
- **录音功能**：系统音频+话筒混录
- **🆕 音乐解密**：支持网易云（NCM）和酷狗（KGM）格式解密转换

### 专业特性
- **快捷键支持**：F1-F12手卡快捷键、全局播放控制
- **淡入淡出**：专业的音量渐变效果
- **播放模式**：单曲循环、列表循环、随机播放
- **实时可视化**：音频波形和频谱显示
- **🆕 格式转换**：自动识别并解密加密音乐文件

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm 或 yarn
- macOS 11+ 或 Windows 10+

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
# 启动渲染进程开发服务器
npm run dev:renderer

# 启动主进程
npm run dev:main

# 或者同时启动两个进程
npm run dev
```

### 构建应用
```bash
# 构建所有代码
npm run build

# 打包分发版本
npm run dist
```

## 🏗️ 技术架构

### 技术栈
- **框架**：Electron 28 + React 18 + TypeScript
- **状态管理**：Zustand
- **样式**：Tailwind CSS
- **音频处理**：Web Audio API + FFmpeg.wasm
- **构建工具**：Vite + Webpack

### 项目结构
```
src/
├── main/           # 主进程代码
│   ├── main.ts     # 主进程入口
│   ├── shortcutManager.ts  # 快捷键管理
│   └── api/        # 主进程API
├── renderer/       # 渲染进程代码
│   ├── components/ # React组件
│   ├── hooks/      # 自定义Hooks
│   ├── store/      # 状态管理
│   ├── utils/      # 工具函数
│   └── types/      # 类型定义
└── preload/        # 预加载脚本
```

## 🎮 快捷键

### 播放控制
- `空格键`：播放/暂停
- `左箭头`：上一首
- `右箭头`：下一首
- `上箭头`：音量增加
- `下箭头`：音量减少

### 专业功能
- `F1-F12`：手卡快捷键（对应不同音乐）
- `Ctrl+上箭头`：淡入效果
- `Ctrl+下箭头`：淡出效果
- `Ctrl+M`：静音切换
- `ESC`：紧急静音

## 🔐 音乐解密功能

### 支持的格式
- **NCM**：网易云音乐加密格式 → MP3/FLAC
- **KGM**：酷狗音乐加密格式 → MP3

### 使用方法
1. 打开"格式转换"功能
2. 选择 NCM 或 KGM 文件
3. 选择目标格式（MP3、WAV、FLAC等）
4. 点击"开始转换"
5. 应用会自动解密并转换

### 特性
- ✅ 自动识别加密格式
- ✅ 保留元数据（歌名、艺术家、专辑）
- ✅ 无损解密
- ✅ 批量处理支持

### 详细文档
- [完整使用指南](./MUSIC_DECRYPT_GUIDE.md)
- [快速开始](./QUICK_START_DECRYPT.md)
- [集成说明](./DECRYPT_INTEGRATION_SUMMARY.md)

### 法律声明
⚠️ 本功能仅用于个人学习和研究目的，请确保拥有音乐文件的合法使用权，不要用于商业用途或分发。

## 📁 数据存储

应用使用本地存储，数据保存在用户目录：
- **macOS**: `~/.wedding-music-player/`
- **Windows**: `%USERPROFILE%\.wedding-music-player\`

包含：
- 音乐库文件
- 播放列表配置
- 用户设置
- 缓存文件

## 🔧 开发指南

### 添加新功能
1. 在 `src/renderer/types/` 中定义类型
2. 在 `src/renderer/store/` 中添加状态管理
3. 在 `src/renderer/components/` 中创建UI组件
4. 在 `src/main/api/` 中实现主进程逻辑

### 音频处理扩展
- 使用 `WebAudioEngine` 类处理音频播放
- 集成 `FFmpeg.wasm` 进行音频转码
- 使用 `WaveSurfer.js` 进行波形显示

### 快捷键配置
在 `src/main/shortcutManager.ts` 中注册新的全局快捷键。

## 🐛 故障排除

### 常见问题
1. **音频无法播放**：检查音频文件格式和权限
2. **快捷键不响应**：确认没有其他应用占用快捷键
3. **应用启动失败**：检查Node.js版本和依赖安装

### 调试模式
开发模式下会自动打开开发者工具，可以查看控制台日志。

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个项目！

## 📞 支持

如有问题或建议，请通过以下方式联系：
- 提交GitHub Issue
- 发送邮件至项目维护者

---

**婚礼音乐播放器** - 让每一场婚礼都充满音乐的魅力！ 🎶

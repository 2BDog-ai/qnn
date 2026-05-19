#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * electron-builder afterPack 钩子
 * 用于在打包后设置FFmpeg的执行权限
 */
exports.default = async function afterPack(context) {
  console.log('🔧 afterPack: 开始设置FFmpeg权限...');
  
  const { electronPlatformName, appOutDir } = context;
  
  try {
    if (electronPlatformName === 'darwin') {
      // macOS: 设置FFmpeg执行权限（位于 .app/Contents/Resources/ffmpeg/ffmpeg）
      const appName = context.packager.appInfo.productFilename;
      const appPath = path.join(appOutDir, `${appName}.app`);
      const ffmpegPath = path.join(appPath, 'Contents', 'Resources', 'ffmpeg', 'ffmpeg');
      
      console.log('🔍 检查FFmpeg路径:', ffmpegPath);
      
      if (fs.existsSync(ffmpegPath)) {
        console.log('✅ 找到FFmpeg文件，设置执行权限...');
        execSync(`chmod +x "${ffmpegPath}"`, { stdio: 'inherit' });
        console.log('✅ FFmpeg权限设置完成');
        
        // 验证权限
        const stats = fs.statSync(ffmpegPath);
        const permissions = (stats.mode & parseInt('777', 8)).toString(8);
        console.log('🔍 FFmpeg权限验证:', permissions);
      } else {
        console.warn('⚠️ 未找到FFmpeg文件:', ffmpegPath);
      }
    } else if (electronPlatformName === 'win32') {
      // Windows: 检查FFmpeg是否存在
      const ffmpegPath = path.join(appOutDir, 'ffmpeg', 'ffmpeg.exe');
      console.log('🔍 检查Windows FFmpeg路径:', ffmpegPath);
      
      if (fs.existsSync(ffmpegPath)) {
        console.log('✅ Windows FFmpeg文件存在');
      } else {
        console.warn('⚠️ 未找到Windows FFmpeg文件:', ffmpegPath);
      }
    }
  } catch (error) {
    console.error('❌ afterPack设置FFmpeg权限失败:', error);
  }
  
  console.log('🔧 afterPack: FFmpeg权限设置完成');
};

#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function run(command) {
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.warn(`Command failed: ${command}`);
    return false;
  }
}

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context;
  console.log(`afterPack started for ${electronPlatformName}`);

  if (electronPlatformName === 'darwin') {
    const appName = context.packager.appInfo.productFilename;
    const appPath = path.join(appOutDir, `${appName}.app`);
    const ffmpegPath = path.join(appPath, 'Contents', 'Resources', 'ffmpeg', 'ffmpeg');

    if (fs.existsSync(ffmpegPath)) {
      run(`chmod +x "${ffmpegPath}"`);
    } else {
      console.warn(`FFmpeg not found: ${ffmpegPath}`);
    }

    if (fs.existsSync(appPath)) {
      run(`xattr -cr "${appPath}"`);
      run(`xattr -dr com.apple.quarantine "${appPath}"`);
      run(`chmod -R +x "${path.join(appPath, 'Contents', 'MacOS')}"`);
      run(`find "${appPath}" -name "*.dylib" -exec chmod 755 {} \\;`);
      run(`codesign --force --deep --sign - "${appPath}"`);
    } else {
      console.warn(`App bundle not found: ${appPath}`);
    }
  }

  if (electronPlatformName === 'win32') {
    const ffmpegPath = path.join(appOutDir, 'ffmpeg', 'ffmpeg.exe');
    if (fs.existsSync(ffmpegPath)) {
      console.log(`Windows FFmpeg found: ${ffmpegPath}`);
    } else {
      console.warn(`Windows FFmpeg not found: ${ffmpegPath}`);
    }
  }

  console.log('afterPack completed.');
};

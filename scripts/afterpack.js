#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context;

  try {
    if (electronPlatformName === 'darwin') {
      const appName = context.packager.appInfo.productFilename;
      const appPath = path.join(appOutDir, `${appName}.app`);
      const executablePaths = [
        path.join(appPath, 'Contents', 'Resources', 'ffmpeg', 'ffmpeg'),
        path.join(appPath, 'Contents', 'Resources', 'demucs', 'mac', 'demucs')
      ];

      for (const executablePath of executablePaths) {
        if (fs.existsSync(executablePath)) {
          execSync(`chmod +x "${executablePath}"`, { stdio: 'inherit' });
          console.log('Executable permission set:', executablePath);
        } else {
          console.warn('Executable not found:', executablePath);
        }
      }
    }

    if (electronPlatformName === 'win32') {
      const executablePaths = [
        path.join(appOutDir, 'ffmpeg', 'ffmpeg.exe'),
        path.join(appOutDir, 'demucs', 'win', 'demucs.exe')
      ];

      for (const executablePath of executablePaths) {
        if (fs.existsSync(executablePath)) {
          console.log('Executable found:', executablePath);
        } else {
          console.warn('Executable not found:', executablePath);
        }
      }
    }
  } catch (error) {
    console.error('afterPack failed:', error);
  }
};

#!/usr/bin/env node

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findAppBuilderExecutable() {
  const candidates = [
    path.join(__dirname, '..', 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe'),
    path.join(__dirname, '..', 'node_modules', 'app-builder-bin', 'win', 'ia32', 'app-builder.exe')
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function findFirstFile(rootDir, fileName, maxDepth = 5) {
  if (!rootDir || !fs.existsSync(rootDir) || maxDepth < 0) {
    return undefined;
  }

  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
      return fullPath;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      continue;
    }
    const found = findFirstFile(path.join(rootDir, entry.name), fileName, maxDepth - 1);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function findRceditExecutable() {
  const cacheRoots = [
    process.env.ELECTRON_BUILDER_CACHE,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'winCodeSign'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache')
  ].filter(Boolean);

  for (const cacheRoot of cacheRoots) {
    const rceditPath = findFirstFile(cacheRoot, 'rcedit-x64.exe');
    if (rceditPath) {
      return rceditPath;
    }
  }

  return undefined;
}

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

      const iconPath = path.join(context.packager.projectDir, 'build', 'app-icon.ico');
      const exePath = path.join(appOutDir, `${context.packager.appInfo.productFilename}.exe`);
      const rceditPath = findRceditExecutable();
      const appBuilderPath = findAppBuilderExecutable();

      if (fs.existsSync(iconPath) && fs.existsSync(exePath) && rceditPath) {
        execFileSync(rceditPath, [exePath, '--set-icon', iconPath], { stdio: 'inherit' });
        console.log('Windows executable icon updated:', exePath);
      } else if (fs.existsSync(iconPath) && fs.existsSync(exePath) && appBuilderPath) {
        const rceditArgs = [exePath, '--set-icon', iconPath];
        execFileSync(appBuilderPath, ['rcedit', '--args', JSON.stringify(rceditArgs)], { stdio: 'inherit' });
        console.log('Windows executable icon updated:', exePath);
      } else {
        console.warn('Skipped Windows executable icon update:', { iconPath, exePath, rceditPath, appBuilderPath });
      }
    }
  } catch (error) {
    console.error('afterPack failed:', error);
  }
};

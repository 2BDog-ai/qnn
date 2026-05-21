#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const releaseDir = path.join(__dirname, '../release');
const appDisplayName = 'Wedding Music Player';
const appBundleName = 'WeddingMusicPlayer.app';

function run(command) {
  try {
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function preprocessMacOSApp(appPath) {
  console.log(`Preprocess macOS app: ${appPath}`);
  run(`xattr -cr "${appPath}"`);
  run(`xattr -dr com.apple.quarantine "${appPath}"`);
  run(`chmod -R +x "${path.join(appPath, 'Contents', 'MacOS')}"`);
  run(`find "${appPath}" -name "*.dylib" -exec chmod 755 {} \\;`);
  run(`codesign --force --deep --sign - "${appPath}"`);
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log(`Created: ${filePath}`);
}

function copyExecutable(source, target) {
  if (!fs.existsSync(source)) return;
  fs.copyFileSync(source, target);
  run(`chmod +x "${target}"`);
  console.log(`Copied: ${target}`);
}

function createMacReadme(dmgFile) {
  const baseName = path.basename(dmgFile, '.dmg');
  const readmePath = path.join(releaseDir, `${baseName}-安装说明.txt`);
  const content = `Wedding Music Player - macOS 安装说明

文件: ${dmgFile}
生成时间: ${new Date().toLocaleString('zh-CN')}

正常安装步骤:
1. 双击打开 ${dmgFile}
2. 把 ${appBundleName} 拖到 Applications / 应用程序
3. 到“应用程序”里右键 ${appBundleName}，选择“打开”

如果提示“已损坏，无法打开”:
这通常是 macOS 对微信、浏览器下载文件添加的隔离限制，不代表软件真的损坏。

推荐修复方法:
1. 打开 DMG
2. 双击 “macOS一键修复.command”
3. 如果系统询问权限，输入这台 Mac 的开机密码
4. 修复完成后会自动打开软件

手动修复命令:
sudo xattr -cr /Applications/${appBundleName}

如果双击脚本提示无法打开:
打开“终端”，输入 chmod +x ，把 macOS一键修复.command 拖进去，按回车；
然后再双击运行 macOS一键修复.command。
`;
  writeFile(readmePath, content);
}

function createWinReadme(exeFile) {
  const baseName = path.basename(exeFile, '.exe');
  const readmePath = path.join(releaseDir, `${baseName}-安装说明.txt`);
  const content = `Wedding Music Player - Windows 安装说明

文件: ${exeFile}
生成时间: ${new Date().toLocaleString('zh-CN')}

安装步骤:
1. 双击运行 ${exeFile}
2. 按安装向导完成安装
3. 如出现 Windows Defender 提示，请选择允许运行
`;
  writeFile(readmePath, content);
}

async function main() {
  console.log('Build postprocess started.');

  if (!fs.existsSync(releaseDir)) {
    console.log('Release directory does not exist, skipped.');
    return;
  }

  const files = fs.readdirSync(releaseDir);
  const dmgFiles = files.filter((file) => file.endsWith('.dmg'));
  const appFiles = files.filter((file) => file.endsWith('.app'));
  const exeFiles = files.filter((file) => file.endsWith('.exe'));

  for (const appFile of appFiles) {
    preprocessMacOSApp(path.join(releaseDir, appFile));
  }

  for (const dmgFile of dmgFiles) {
    createMacReadme(dmgFile);
  }

  for (const exeFile of exeFiles) {
    createWinReadme(exeFile);
  }

  if (dmgFiles.length > 0 || appFiles.length > 0) {
    copyExecutable(
      path.join(__dirname, 'macos-fix.sh'),
      path.join(releaseDir, 'macOS一键修复.command')
    );
    copyExecutable(
      path.join(__dirname, 'install.sh'),
      path.join(releaseDir, 'macOS安装并修复.command')
    );
  }

  console.log(`Build postprocess completed for ${appDisplayName}.`);
}

main().catch((error) => {
  console.error('Build postprocess failed:', error);
  process.exit(1);
});

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const releaseDir = path.join(__dirname, '../release');
const appDisplayName = 'YIYU';
const appBundleName = 'YIYU.app';

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
  const readmePath = path.join(releaseDir, `${baseName}-install.txt`);
  const content = `${appDisplayName} - macOS Install

File: ${dmgFile}
Generated: ${new Date().toLocaleString('zh-CN')}

Install:
1. Open the DMG.
2. Drag ${appBundleName} to Applications.
3. Right-click ${appBundleName} in Applications and choose Open.

Apple Silicon M1/M2/M3/M4: use mac-arm64.dmg.
Intel Mac: use mac-x64.dmg.

If macOS blocks the app, run:
sudo xattr -cr /Applications/${appBundleName}
`;
  writeFile(readmePath, content);
}

function createWinReadme(exeFile) {
  const baseName = path.basename(exeFile, '.exe');
  const readmePath = path.join(releaseDir, `${baseName}-install.txt`);
  const content = `${appDisplayName} - Windows Install

File: ${exeFile}
Generated: ${new Date().toLocaleString('zh-CN')}

Install:
1. Double-click the installer.
2. Follow the installer steps.
3. If Windows Defender prompts, choose allow/run.
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
    copyExecutable(path.join(__dirname, 'macos-fix.sh'), path.join(releaseDir, 'YIYU Repair.command'));
    copyExecutable(path.join(__dirname, 'install.sh'), path.join(releaseDir, 'YIYU Install.command'));
  }

  console.log(`Build postprocess completed for ${appDisplayName}.`);
}

main().catch((error) => {
  console.error('Build postprocess failed:', error);
  process.exit(1);
});

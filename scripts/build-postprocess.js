#!/usr/bin/env node

// 构建后处理脚本 - 自动设置权限和创建说明文件

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const releaseDir = path.join(__dirname, '../release');

// macOS 应用预处理函数 - 在构建时就移除隔离属性
async function preprocessMacOSApp(appPath) {
  console.log(`🔧 预处理 macOS 应用: ${appPath}`);
  
  try {
    // 移除隔离属性
    console.log('  - 移除隔离属性...');
    try {
      execSync(`xattr -cr "${appPath}"`, { stdio: 'ignore' });
      execSync(`xattr -dr com.apple.quarantine "${appPath}"`, { stdio: 'ignore' });
      console.log('  ✅ 隔离属性移除成功');
    } catch (e) {
      console.log('  ⚠️  隔离属性移除失败（可能不存在）');
    }

    // 设置执行权限
    console.log('  - 设置执行权限...');
    try {
      execSync(`chmod -R +x "${appPath}/Contents/MacOS/"`, { stdio: 'ignore' });
      execSync(`find "${appPath}" -name "*.dylib" -exec chmod 755 {} \\;`, { stdio: 'ignore' });
      console.log('  ✅ 执行权限设置成功');
    } catch (e) {
      console.log('  ⚠️  执行权限设置失败');
    }

    // 重新签名（如果可能）
    console.log('  - 尝试重新签名...');
    try {
      execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'ignore' });
      console.log('  ✅ 重新签名成功');
    } catch (e) {
      console.log('  ⚠️  重新签名失败（正常现象）');
    }

    console.log(`✅ ${appPath} 预处理完成`);
  } catch (error) {
    console.log(`❌ ${appPath} 预处理失败: ${error.message}`);
  }
}

// 删除重复的代码，移到 main 函数中

// 主处理函数
async function main() {
  console.log('🔧 开始构建后处理...');

  // 检查release目录是否存在
  if (!fs.existsSync(releaseDir)) {
    console.log('❌ Release目录不存在，跳过构建后处理');
    return;
  }

  // 查找生成的 DMG 文件和 APP 文件
  const files = fs.readdirSync(releaseDir);
  const dmgFiles = files.filter(file => file.endsWith('.dmg'));
  const appFiles = files.filter(file => file.endsWith('.app'));
  const exeFiles = files.filter(file => file.endsWith('.exe'));

  console.log(`找到的文件: DMG(${dmgFiles.length}), APP(${appFiles.length}), EXE(${exeFiles.length})`);

  // macOS 处理
  if (dmgFiles.length > 0 || appFiles.length > 0) {
    console.log(`✅ 找到 macOS 文件: DMG(${dmgFiles.join(', ')}), APP(${appFiles.join(', ')})`);
    
    // 对所有 APP 文件执行预处理（移除隔离属性等）
    for (const appFile of appFiles) {
      const appPath = path.join(releaseDir, appFile);
      await preprocessMacOSApp(appPath);
    }

    // 为每个 DMG 创建使用说明
    dmgFiles.forEach(dmgFile => {
      const baseName = path.basename(dmgFile, '.dmg');
      const readmePath = path.join(releaseDir, `${baseName}-安装说明.txt`);
      
      const readmeContent = `🎵 艺语音乐播放器 - macOS 安装说明

版本: ${process.env.npm_package_version || '1.0.0'}
文件: ${dmgFile}
生成时间: ${new Date().toLocaleString('zh-CN')}

📋 安装步骤:
1. 双击 ${dmgFile} 打开安装程序
2. 将"艺语音乐播放器.app"拖拽到"应用程序"文件夹
3. 双击"自动安装.sh"进行一键安装（推荐）

⚠️  重要提醒:
- 首次运行可能提示"已损坏"或"无法验证开发者"
- 这是 macOS 的安全机制，不是真正的损坏
- 应用已经过预处理，大部分情况下可以直接使用

🛠️  如果仍有问题，手动解决方法:
方法一（推荐）:
1. 打开"终端"应用
2. 输入: sudo xattr -cr /Applications/艺语音乐播放器.app
3. 输入管理员密码，按回车

方法二:
1. 右键点击应用，选择"打开"
2. 在弹出的警告中点击"打开"

💡 使用技巧:
- 支持拖拽音频文件到应用图标快速导入
- 支持 MP3、WAV、FLAC、M4A 等常见音频格式
- 内置人声消除、音频编辑等专业功能

祝您使用愉快！ 🎶
`;

      fs.writeFileSync(readmePath, readmeContent, 'utf8');
      console.log(`✅ 创建 macOS 安装说明: ${readmePath}`);
    });

    // 创建一键修复脚本的副本到 release 目录
    const fixScriptSource = path.join(__dirname, 'macos-fix.sh');
    const fixScriptTarget = path.join(releaseDir, '艺语音乐播放器-一键修复工具.sh');

    if (fs.existsSync(fixScriptSource)) { 
      fs.copyFileSync(fixScriptSource, fixScriptTarget);
      // 设置执行权限
      try {
        execSync(`chmod +x "${fixScriptTarget}"`);
        console.log('✅ 创建独立修复工具');
      } catch (error) {
        console.log('⚠️  设置修复工具权限失败，请手动设置');
      }
    }
  }

  // Windows 处理
  if (exeFiles.length > 0) {
    console.log(`✅ 找到 Windows 安装文件: ${exeFiles.join(', ')}`);
    
    // 为每个 EXE 创建使用说明
    exeFiles.forEach(exeFile => {
      const baseName = path.basename(exeFile, '.exe');
      const readmePath = path.join(releaseDir, `${baseName}-安装说明.txt`);
      
      const readmeContent = `🎵 艺语音乐播放器 - Windows 安装说明

版本: ${process.env.npm_package_version || '1.0.0'}
文件: ${exeFile}
生成时间: ${new Date().toLocaleString('zh-CN')}

📋 安装步骤:
1. 右键点击 ${exeFile}，选择"以管理员身份运行"
2. 按照安装向导完成安装
3. 首次运行时可能需要允许防火墙访问

⚠️  重要提醒:
- 请以管理员身份运行安装程序
- 安装过程中可能触发 Windows Defender 警告，这是正常现象
- 如果杀毒软件误报，请添加到白名单

🛠️  如果遇到问题:
1. 关闭杀毒软件后重新安装
2. 确保以管理员身份运行
3. 检查系统是否支持（Windows 10/11）

💡 使用技巧:
- 支持拖拽音频文件到应用窗口快速导入
- 支持 MP3、WAV、FLAC、M4A 等常见音频格式
- 内置人声消除、音频编辑等专业功能

祝您使用愉快！ 🎶
`;

      fs.writeFileSync(readmePath, readmeContent, 'utf8');
      console.log(`✅ 创建 Windows 安装说明: ${readmePath}`);
    });
  }

  console.log('🎉 构建后处理完成！');
}

// 运行主函数
main().catch(error => {
  console.error('❌ 构建后处理失败:', error);
  process.exit(1);
});

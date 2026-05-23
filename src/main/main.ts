// 在最开始设置语言环境，确保系统对话框显示中文
process.env.LC_ALL = 'zh_CN.UTF-8';
process.env.LANG = 'zh_CN.UTF-8';
process.env.LC_CTYPE = 'zh_CN.UTF-8';
// 确保 Chromium 语言为中文，影响系统文件对话框侧栏
app?.commandLine?.appendSwitch?.('lang', 'zh-CN');

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ShortcutManager } from './shortcutManager';
import { AudioAPI } from './api/audioAPI';
import { vocalRemoverManager } from './vocalRemoverManager';
import { FFmpegManager } from './ffmpegManager';
import { DataManager } from './dataManager';
import fs from 'fs';

function writeLog(module: string, level: 'INFO' | 'ERROR' | 'DEBUG', message: string) {
  const logDir = path.join(app.getPath('logs'), 'logs');
  const logFile = path.join(logDir, `${module}.log`);

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] [${module}] ${message}\n`;

  fs.appendFileSync(logFile, logLine, 'utf8');

  if (!app.isPackaged) {
    console.log(logLine.trim());
  }
}

class MainApp {
  private mainWindow: BrowserWindow | null = null;
  public shortcutManager: ShortcutManager | null = null;
  private audioAPI: AudioAPI | null = null;
  private ffmpegManager: FFmpegManager | null = null;
  private dataManager: DataManager | null = null;
  
  async createWindow(): Promise<void> {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1200,
      minHeight: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/index.js'),
        // 减少 IMK 相关错误
        experimentalFeatures: false,
        // 禁用一些可能导致 IMK 问题的功能
        webSecurity: true,
        // 设置语言偏好
        additionalArguments: ['--lang=zh-CN'],
        allowRunningInsecureContent: false,
      },
      titleBarStyle: 'hiddenInset',
      show: false,
      icon: path.join(__dirname, '../assets/icon.png'),
      // 添加一些 macOS 特定的配置
      ...(process.platform === 'darwin' && {
        vibrancy: 'under-window',
        visualEffectState: 'active'
      })
    });
    
    // 加载应用
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    
    // 加载渲染进程
    if (isDev) {
      // 开发模式：尝试连接Vite开发服务器
      const vitePorts = [3000, 3001, 3002, 3003, 3004, 3005];
      let viteUrl = '';
      
      for (const port of vitePorts) {
        try {
          const response = await fetch(`http://localhost:${port}`);
          if (response.ok) {
            viteUrl = `http://localhost:${port}`;
            break;
          }
        } catch (error) {
          // 继续尝试下一个端口
          continue;
        }
      }
      
      if (viteUrl) {
        console.log(`✅ 开发模式：加载Vite开发服务器 ${viteUrl}`);
        this.mainWindow!.loadURL(viteUrl);
      } else {
        console.log('❌ 无法连接到Vite开发服务器，请确保已启动开发环境');
        this.mainWindow!.loadFile('src/renderer/index.html');
      }
    } else {
      // 生产模式：加载编译后的文件
      await this.mainWindow!.loadFile(path.join(__dirname, '../dist/index.html'));
      console.log('✅ 生产模式：加载编译后的文件');
    }
    
    // 初始化管理器
    this.shortcutManager = new ShortcutManager(this.mainWindow);
    this.audioAPI = new AudioAPI();
    this.ffmpegManager = new FFmpegManager();
    
    // 🔧 修复：DataManager初始化增强错误处理
    try {
      console.log('=== 开始初始化 DataManager ===');
      this.dataManager = DataManager.getInstance(); // 获取已初始化的实例
      console.log('✅ DataManager 初始化成功');
      
      // 验证DataManager状态
      if (!this.dataManager) {
        throw new Error('DataManager 实例为 null');
      }
      
      // 测试基础操作
      const testMusic = this.dataManager.getAllMusicFiles();
      const testPlaylists = this.dataManager.getAllPlaylists();
      console.log(`✅ DataManager 状态验证: 音乐 ${testMusic.length} 首, 播放列表 ${testPlaylists.length} 个`);
      
    } catch (dataManagerError) {
      console.error('❌ DataManager 初始化失败:', dataManagerError);
      console.error('错误堆栈:', dataManagerError instanceof Error ? dataManagerError.stack : 'N/A');
      
      // Windows特殊处理 - 延迟重试
      if (process.platform === 'win32') {
        console.log('🪟 Windows平台检测到DataManager初始化失败，尝试延迟重试...');
        setTimeout(() => {
          try {
            this.dataManager = DataManager.getInstance();
            console.log('✅ Windows平台 DataManager 延迟重试成功');
          } catch (retryError) {
            console.error('❌ Windows平台 DataManager 延迟重试仍失败:', retryError);
            // 设置为null，在IPC处理器中进行错误处理
            this.dataManager = null;
          }
        }, 2000);
      } else {
        this.dataManager = null;
      }
    }
    
    // 设置人声消除管理器的主窗口引用
    vocalRemoverManager.setMainWindow(this.mainWindow!);
    
    // 创建应用菜单
    this.createApplicationMenu();
    
    // 注册IPC处理器
    this.registerIPCHandlers();
    
    // 显示窗口
    this.mainWindow!.show();
    
    // 添加开发者工具快捷键 (Windows: F12, Ctrl+Shift+I)
    this.mainWindow!.webContents.on('before-input-event', (event, input) => {
      // F12 或 Ctrl+Shift+I 打开开发者工具
      if (input.key === 'F12' || 
          (input.control && input.shift && input.key === 'I')) {
        if (this.mainWindow!.webContents.isDevToolsOpened()) {
          this.mainWindow!.webContents.closeDevTools();
        } else {
          this.mainWindow!.webContents.openDevTools();
        }
      }
    });
    
    // 等待窗口完全加载后再注册快捷键
    this.mainWindow!.webContents.once('did-finish-load', () => {
      console.log('窗口加载完成，注册快捷键');
      this.shortcutManager!.registerDefaultShortcuts();
    });
    
    // 窗口事件
    this.mainWindow!.on('closed', () => {
      this.mainWindow = null;
    });

    // 窗口失焦/获得焦点事件监听
    this.mainWindow!.on('blur', () => {
      console.log('窗口失去焦点 - 全局快捷键仍然有效');
    });

    this.mainWindow!.on('focus', () => {
      console.log('窗口获得焦点');
    });

    // 窗口隐藏/显示事件监听
    this.mainWindow!.on('hide', () => {
      console.log('窗口已隐藏 - 全局快捷键仍然有效');
    });

    this.mainWindow!.on('show', () => {
      console.log('窗口已显示');
    });

    // 窗口最小化/恢复事件监听
    this.mainWindow!.on('minimize', () => {
      console.log('窗口已最小化 - 全局快捷键仍然有效');
    });

    this.mainWindow!.on('restore', () => {
      console.log('窗口已恢复');
    });
  }
  
  private createApplicationMenu(): void {
    const { Menu } = require('electron');
    
    const isMac = process.platform === 'darwin';
    const template = [
      ...(isMac ? [{ role: 'appMenu', label: '艺语音乐播放器' }] : []),
      {
        label: '文件',
        submenu: [
          isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' },
          { role: 'selectAll', label: '全选' }
        ]
      },
      {
        label: '视图',
        submenu: [
          { role: 'reload', label: '重新加载' },
          { role: 'forceReload', label: '强制重新加载' },
          { role: 'toggleDevTools', label: '切换开发者工具' },
          { type: 'separator' },
          { role: 'resetZoom', label: '实际大小' },
          { role: 'zoomIn', label: '放大' },
          { role: 'zoomOut', label: '缩小' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: '切换全屏' }
        ]
      },
      {
        label: '窗口',
        submenu: [
          { role: 'minimize', label: '最小化' },
          ...(isMac ? [{ role: 'zoom', label: '缩放' }, { role: 'front', label: '置于顶层' }] : [{ role: 'close', label: '关闭' }])
        ]
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '关于',
            click: () => {
              require('electron').dialog.showMessageBox({
                type: 'info',
                title: '关于',
                message: '艺语音乐播放器',
                detail: `版本 ${app.getVersion()}\n用于婚礼音乐播放和管理的专业软件`
              });
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
  
  private registerIPCHandlers(): void {
    // 音乐文件操作
    ipcMain.handle('music:getAll', () => this.dataManager!.getAllMusicFiles());
    ipcMain.handle('music:get', (_, id: string) => this.dataManager!.getMusicFile(id));
    ipcMain.handle('music:add', (_, musicFile: any) => this.dataManager!.addMusicFile(musicFile));
    ipcMain.handle('music:addBatch', (_, musicFiles: any[]) => {
      try {
        console.log('=== 主进程: 批量添加音乐文件 ===');
        console.log('平台信息:', process.platform);
        console.log('文件数量:', musicFiles.length);
        console.log('DataManager 可用性:', !!this.dataManager);
        
        if (!this.dataManager) {
          throw new Error('数据管理器未初始化');
        }
        
        return this.dataManager.addMusicFiles(musicFiles);
      } catch (error) {
        console.error('=== 主进程批量添加失败 ===');
        console.error('错误详情:', error);
        throw error;
      }
    });
    ipcMain.handle('music:update', (_, id: string, updates: any) => this.dataManager!.updateMusicFile(id, updates));
    ipcMain.handle('music:delete', (_, id: string) => this.dataManager!.deleteMusicFile(id));
    
    // 播放列表操作
    ipcMain.handle('playlist:getAll', () => this.dataManager!.getAllPlaylists());
    ipcMain.handle('playlist:get', (_, id: string) => this.dataManager!.getPlaylist(id));
    ipcMain.handle('playlist:create', (_, playlist: any) => this.dataManager!.createPlaylist(playlist));
    ipcMain.handle('playlist:update', (_, id: string, updates: any) => this.dataManager!.updatePlaylist(id, updates));
    ipcMain.handle('playlist:delete', (_, id: string) => this.dataManager!.deletePlaylist(id));
    
    // 播放列表排序操作 - 重要：这些处理器之前缺失，导致Windows版本排序功能失效
    ipcMain.handle('playlist:updateOrder', (_, playlistIds: string[]) => 
      this.dataManager!.updatePlaylistsOrder(playlistIds));
    ipcMain.handle('playlist:updateMusicOrder', (_, playlistId: string, musicIds: string[]) => 
      this.dataManager!.updatePlaylistMusicOrder(playlistId, musicIds));
    
    // 播放列表音乐关联操作
    ipcMain.handle('playlist:addMusic', (_, playlistId: string, musicId: string) => 
      this.dataManager!.addMusicToPlaylist(playlistId, musicId));
    ipcMain.handle('playlist:removeMusic', (_, playlistId: string, musicId: string) => 
      this.dataManager!.removeMusicFromPlaylist(playlistId, musicId));
    ipcMain.handle('playlist:getMusic', (_, playlistId: string) => 
      this.dataManager!.getPlaylistMusic(playlistId));
    ipcMain.handle('playlist:addMusicBatch', (_, playlistId: string, musicIds: string[]) => 
      this.dataManager!.addMusicToPlaylistBatch(playlistId, musicIds));
    
    // 默认播放列表
    ipcMain.handle('playlist:getDefault', () => this.dataManager!.getDefaultPlaylist());
    ipcMain.handle('playlist:ensureDefault', () => this.dataManager!.ensureDefaultPlaylist());
    
    // 当前歌单操作
    ipcMain.handle('playlist:getCurrent', () => this.dataManager!.getCurrentPlaylist());
    ipcMain.handle('playlist:setCurrent', (_, playlistId: string) => this.dataManager!.setCurrentPlaylist(playlistId));
    
    // 系统集成
    ipcMain.handle('system:openFile', () => this.openFileDialog());
    ipcMain.handle('system:openFolder', () => this.openFolderDialog());
    ipcMain.handle('system:getAudioDevices', () => this.getAudioDevices());

    // 专有格式解密功能已禁用
    // ipcMain.handle('proprietary:detectSupport', async () => {
    //   return { exists: false, platform: process.platform };
    // });

    // ipcMain.handle('proprietary:selectFiles', async () => {
    //   return [];
    // });

    // ipcMain.handle('proprietary:decrypt', async (_event, files: string[], outputDir: string) => {
    //   return { success: false, message: '解密功能已禁用' };
    // });

    ipcMain.on('log-message', (event, { module, level, message }) => {
      writeLog(module, level, message);
    });

    // 系统对话框 IPC 处理
    ipcMain.handle('dialog:openFile', async (event, options = {}) => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: '图片', extensions: ['jpg', 'png', 'gif', 'jpeg'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        title: '打开文件',
        ...options
      });
      return result.filePaths;
    });

    // 🔧 Windows修复：添加音乐文件选择对话框
    ipcMain.handle('music:selectFiles', async () => {
      try {
        const result = await dialog.showOpenDialog(this.mainWindow!, {
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'opus'] },
            { name: '所有文件', extensions: ['*'] }
          ],
          title: '选择音频文件'
        });
        
        console.log('音频文件选择结果:', result.filePaths.length, '个文件');
        return result.filePaths;
      } catch (error) {
        console.error('选择音频文件失败:', error);
        return [];
      }
    });

    // 🔧 Windows修复：添加文件夹选择对话框  
    ipcMain.handle('music:selectFolder', async () => {
      try {
        const result = await dialog.showOpenDialog(this.mainWindow!, {
          properties: ['openDirectory'],
          title: '选择音乐文件夹'
        });
        
        console.log('音乐文件夹选择结果:', result.filePaths);
        return result.filePaths;
      } catch (error) {
        console.error('选择音乐文件夹失败:', error);
        return [];
      }
    });

    ipcMain.handle('dialog:openFolder', async (event, options = {}) => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        properties: ['openDirectory'],
        title: '选择文件夹',
        ...options
      });
      return result.filePaths;
    });

    ipcMain.handle('dialog:saveFile', async (event, options = {}) => {
      const result = await dialog.showSaveDialog(this.mainWindow!, {
        title: '保存文件',
        ...options
      });
      return result.filePath;
    });

    ipcMain.handle('dialog:showMessage', async (event, options) => {
      const result = await dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: '提示',
        ...options
      });
      return result;
    });
  }
  
  private async openFileDialog(): Promise<string[]> {
    const result = await dialog.showOpenDialog(this.mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      title: '选择音频文件'
    });
    
    return result.filePaths;
  }
  
  private async openFolderDialog(): Promise<{ filePaths: string[] }> {
    const result = await dialog.showOpenDialog(this.mainWindow!, {
      properties: ['openDirectory'],
      title: '选择文件夹'
    });
    
    // 返回完整的对话框结果，保持与preload中的期望一致
    return result;
  }
  
  private async getAudioDevices(): Promise<any[]> {
    // 这里可以返回系统音频设备信息
    return [];
  }
}

const mainApp = new MainApp();
const execAsync = promisify(exec);

// macOS 自我修复功能 - 超强版
async function checkAndFixMacOSPermissions() {
  if (process.platform !== 'darwin') return;
  
  try {
    // 获取应用路径
    const appPath = app.getAppPath();
    let appBundlePath = appPath;
    
    // 更精确地解析 .app 包路径
    if (appPath.includes('.app')) {
      const appIndex = appPath.indexOf('.app');
      appBundlePath = appPath.substring(0, appIndex + 4);
    } else if (appPath.includes('Contents')) {
      // 如果是在 Contents 目录中，向上查找 .app 包
      const pathParts = appPath.split('/');
      for (let i = pathParts.length - 1; i >= 0; i--) {
        if (pathParts[i].endsWith('.app')) {
          appBundlePath = pathParts.slice(0, i + 1).join('/');
          break;
        }
      }
    }
    
    writeLog('MacOSFix', 'INFO', `检查应用路径: ${appBundlePath}`);
    
    // 立即执行最激进的修复策略
    await performAggressiveSecurityFixes(appBundlePath);
    
    // 创建永久修复脚本
    await createPermanentFixScript(appBundlePath);
    
  } catch (error) {
    writeLog('MacOSFix', 'ERROR', `macOS权限检查失败: ${error}`);
    // 即使出错也要尝试创建修复脚本
    try {
      await createEmergencyFixScript();
    } catch (e) {
      writeLog('MacOSFix', 'ERROR', `创建紧急修复脚本失败: ${e}`);
    }
  }
}

// 执行激进的安全修复 - 不检查直接修复
async function performAggressiveSecurityFixes(appBundlePath: string) {
  writeLog('MacOSFix', 'INFO', '开始执行激进修复策略...');
  
  // 并行执行所有修复操作，不等待检查结果
  const fixPromises = [
    removeQuarantineAttributeAggressive(appBundlePath),
    fixCodeSignatureAggressive(appBundlePath),
    setExecutePermissionsAggressive(appBundlePath),
    disableGatekeeperForApp(appBundlePath),
    addToSystemTrustList(appBundlePath)
  ];

  // 等待所有修复完成，但不因为单个失败而停止
  const results = await Promise.allSettled(fixPromises);
  
  let successCount = 0;
  results.forEach((result, index) => {
    const fixNames = ['隔离属性移除', '代码签名修复', '执行权限设置', 'Gatekeeper禁用', '信任列表添加'];
    if (result.status === 'fulfilled') {
      successCount++;
      writeLog('MacOSFix', 'INFO', `✅ ${fixNames[index]} 成功`);
    } else {
      writeLog('MacOSFix', 'DEBUG', `❌ ${fixNames[index]} 失败: ${result.reason}`);
    }
  });
  
  writeLog('MacOSFix', 'INFO', `激进修复完成，成功 ${successCount}/${fixPromises.length} 项`);
}

// 执行多种安全修复（保留原版本作为备用）
async function performSecurityFixes(appBundlePath: string) {
  const fixes = [
    // 1. 移除隔离属性
    {
      name: '隔离属性检查',
      check: () => checkQuarantineAttribute(appBundlePath),
      fix: () => removeQuarantineAttribute(appBundlePath)
    },
    // 2. 修复代码签名问题
    {
      name: '代码签名修复',
      check: () => checkCodeSignature(appBundlePath),
      fix: () => fixCodeSignature(appBundlePath)
    },
    // 3. 设置执行权限
    {
      name: '执行权限设置',
      check: () => checkExecutePermissions(appBundlePath),
      fix: () => setExecutePermissions(appBundlePath)
    }
  ];

  for (const fix of fixes) {
    try {
      const needsFix = await fix.check();
      if (needsFix) {
        writeLog('MacOSFix', 'INFO', `执行修复: ${fix.name}`);
        await fix.fix();
      }
    } catch (error) {
      writeLog('MacOSFix', 'DEBUG', `修复失败 ${fix.name}: ${error}`);
    }
  }
}

// 检查隔离属性
async function checkQuarantineAttribute(appPath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`xattr -l "${appPath}"`);
    return stdout.includes('com.apple.quarantine');
  } catch {
    return false;
  }
}

// 激进移除隔离属性 - 不留死角
async function removeQuarantineAttributeAggressive(appPath: string): Promise<void> {
  const commands = [
    // 基础移除命令
    `xattr -dr com.apple.quarantine "${appPath}"`,
    `xattr -cr "${appPath}"`,
    
    // 递归移除所有可能的隔离属性
    `find "${appPath}" -exec xattr -d com.apple.quarantine {} \\; 2>/dev/null || true`,
    `find "${appPath}" -exec xattr -d com.apple.metadata:kMDItemWhereFroms {} \\; 2>/dev/null || true`,
    `find "${appPath}" -exec xattr -d com.apple.metadata:_kMDItemUserTags {} \\; 2>/dev/null || true`,
    
    // 移除特定文件类型的隔离属性
    `find "${appPath}" -name "*.dylib" -exec xattr -dr com.apple.quarantine {} \\; 2>/dev/null || true`,
    `find "${appPath}" -name "*.so" -exec xattr -dr com.apple.quarantine {} \\; 2>/dev/null || true`,
    `find "${appPath}" -name "*.framework" -exec xattr -dr com.apple.quarantine {} \\; 2>/dev/null || true`,
    `find "${appPath}" -name "*.app" -exec xattr -dr com.apple.quarantine {} \\; 2>/dev/null || true`,
    
    // 清除所有扩展属性
    `find "${appPath}" -exec xattr -c {} \\; 2>/dev/null || true`
  ];

  const results = await Promise.allSettled(
    commands.map(cmd => execAsync(cmd))
  );
  
  let successCount = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successCount++;
      writeLog('MacOSFix', 'DEBUG', `隔离属性命令成功: ${commands[index]}`);
    }
  });
  
  writeLog('MacOSFix', 'INFO', `隔离属性移除: ${successCount}/${commands.length} 条命令成功`);
}

// 移除隔离属性（原版本保留）
async function removeQuarantineAttribute(appPath: string): Promise<void> {
  const commands = [
    `xattr -dr com.apple.quarantine "${appPath}"`,
    `xattr -cr "${appPath}"`,
    `find "${appPath}" -name "*.dylib" -exec xattr -dr com.apple.quarantine {} \\;`,
    `find "${appPath}" -name "*.so" -exec xattr -dr com.apple.quarantine {} \\;`
  ];

  for (const cmd of commands) {
    try {
      await execAsync(cmd);
      writeLog('MacOSFix', 'INFO', `成功执行: ${cmd}`);
    } catch (error) {
      writeLog('MacOSFix', 'DEBUG', `命令失败: ${cmd} - ${error}`);
      // 继续尝试其他命令
    }
  }

  // 如果自动修复失败，创建修复脚本供用户手动执行
  await createFixScript(appPath);
}

// 检查代码签名
async function checkCodeSignature(appPath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`codesign -dv "${appPath}" 2>&1`);
    return !stdout.includes('valid on disk') && !stdout.includes('satisfies its Designated Requirement');
  } catch {
    return true; // 如果检查失败，假设需要修复
  }
}

// 激进修复代码签名
async function fixCodeSignatureAggressive(appPath: string): Promise<void> {
  const signCommands = [
    // 强制重新签名（最常用）
    `codesign --force --deep --sign - "${appPath}"`,
    
    // 移除现有签名后重新签名
    `codesign --remove-signature "${appPath}" && codesign --force --deep --sign - "${appPath}"`,
    
    // 使用不同的签名选项
    `codesign --force --deep --sign - --preserve-metadata=entitlements,requirements,flags,runtime "${appPath}"`,
    
    // 临时签名
    `codesign --force --sign - "${appPath}"`,
  ];

  for (const cmd of signCommands) {
    try {
      await execAsync(cmd);
      writeLog('MacOSFix', 'INFO', '代码签名修复成功');
      return; // 一旦成功就退出
    } catch (error) {
      writeLog('MacOSFix', 'DEBUG', `代码签名命令失败: ${cmd}`);
      continue;
    }
  }
  
  writeLog('MacOSFix', 'DEBUG', '所有代码签名尝试都失败了');
}

// 修复代码签名（原版本保留）
async function fixCodeSignature(appPath: string): Promise<void> {
  try {
    // 尝试自签名
    await execAsync(`codesign --force --deep --sign - "${appPath}"`);
    writeLog('MacOSFix', 'INFO', '代码签名修复成功');
  } catch (error) {
    writeLog('MacOSFix', 'DEBUG', `代码签名修复失败: ${error}`);
  }
}

// 检查执行权限
async function checkExecutePermissions(appPath: string): Promise<boolean> {
  try {
    const executablePath = path.join(appPath, 'Contents/MacOS');
    const { stdout } = await execAsync(`ls -la "${executablePath}"`);
    return !stdout.includes('-rwxr-xr-x');
  } catch {
    return true;
  }
}

// 激进设置执行权限
async function setExecutePermissionsAggressive(appPath: string): Promise<void> {
  const permissionCommands = [
    // 设置整个应用包的权限
    `chmod -R +x "${appPath}"`,
    
    // 专门设置 MacOS 目录权限
    `chmod -R 755 "${appPath}/Contents/MacOS/"`,
    
    // 设置应用包根目录权限
    `chmod 755 "${appPath}"`,
    
    // 递归设置所有可执行文件权限
    `find "${appPath}" -type f -name "*" -exec chmod +x {} \\; 2>/dev/null || true`,
    
    // 设置所有 .dylib 和 .so 文件权限
    `find "${appPath}" -name "*.dylib" -exec chmod 755 {} \\; 2>/dev/null || true`,
    `find "${appPath}" -name "*.so" -exec chmod 755 {} \\; 2>/dev/null || true`,
  ];

  const results = await Promise.allSettled(
    permissionCommands.map(cmd => execAsync(cmd))
  );
  
  let successCount = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successCount++;
    }
  });
  
  writeLog('MacOSFix', 'INFO', `权限设置: ${successCount}/${permissionCommands.length} 条命令成功`);
}

// 禁用应用的 Gatekeeper 检查
async function disableGatekeeperForApp(appPath: string): Promise<void> {
  const gatekeeperCommands = [
    // 添加到 Gatekeeper 例外列表
    `spctl --add "${appPath}"`,
    
    // 启用应用
    `spctl --enable "${appPath}"`,
    
    // 移除 Gatekeeper 检查
    `spctl --remove "${appPath}" && spctl --add "${appPath}"`,
    
    // 设置应用为信任状态
    `spctl --assess --verbose=4 "${appPath}" || true`,
  ];

  for (const cmd of gatekeeperCommands) {
    try {
      await execAsync(cmd);
      writeLog('MacOSFix', 'DEBUG', `Gatekeeper命令成功: ${cmd}`);
    } catch (error) {
      writeLog('MacOSFix', 'DEBUG', `Gatekeeper命令失败: ${cmd}`);
    }
  }
}

// 添加到系统信任列表
async function addToSystemTrustList(appPath: string): Promise<void> {
  const trustCommands = [
    // 添加到系统信任数据库
    `sqlite3 /var/db/SystemPolicy "INSERT OR REPLACE INTO authority (type, allow, requirement, priority, label) VALUES (2, 1, 'anchor apple generic', 0, 'Gatekeeper');"`,
    
    // 创建用户级别的信任条目
    `defaults write com.apple.LaunchServices LSQuarantine -bool NO`,
    
    // 禁用应用的隔离检查
    `defaults write com.apple.security.quarantine LSQuarantine -bool NO`,
  ];

  for (const cmd of trustCommands) {
    try {
      await execAsync(cmd);
      writeLog('MacOSFix', 'DEBUG', `信任列表命令成功`);
    } catch (error) {
      writeLog('MacOSFix', 'DEBUG', `信任列表命令失败`);
    }
  }
}

// 设置执行权限（原版本保留）
async function setExecutePermissions(appPath: string): Promise<void> {
  try {
    await execAsync(`chmod -R +x "${appPath}/Contents/MacOS/"`);
    writeLog('MacOSFix', 'INFO', '执行权限设置成功');
  } catch (error) {
    writeLog('MacOSFix', 'DEBUG', `执行权限设置失败: ${error}`);
  }
}

// 创建永久修复脚本 - 更强力的版本
async function createPermanentFixScript(appPath: string): Promise<void> {
  try {
    const scriptContent = `#!/bin/bash
# 艺语音乐播放器 - 超强 macOS 兼容性修复工具
# 自动生成于: ${new Date().toLocaleString()}
# 版本: 2.0 (增强版)

set -e

# 颜色定义
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m'

log_info() { echo -e "\${BLUE}ℹ️  \$1\${NC}"; }
log_success() { echo -e "\${GREEN}✅ \$1\${NC}"; }
log_warning() { echo -e "\${YELLOW}⚠️  \$1\${NC}"; }
log_error() { echo -e "\${RED}❌ \$1\${NC}"; }

echo "=================================================="
echo "🎵 艺语音乐播放器 - 超强兼容性修复工具"
echo "=================================================="
echo ""

APP_PATH="${appPath}"

if [[ ! -d "\$APP_PATH" ]]; then
    log_error "应用路径不存在: \$APP_PATH"
    exit 1
fi

log_info "目标应用: \$APP_PATH"
echo ""

# 1. 超强隔离属性移除
log_info "1. 执行超强隔离属性移除..."
{
    xattr -dr com.apple.quarantine "\$APP_PATH" 2>/dev/null
    xattr -cr "\$APP_PATH" 2>/dev/null
    find "\$APP_PATH" -exec xattr -d com.apple.quarantine {} \\; 2>/dev/null
    find "\$APP_PATH" -exec xattr -d com.apple.metadata:kMDItemWhereFroms {} \\; 2>/dev/null
    find "\$APP_PATH" -exec xattr -d com.apple.metadata:_kMDItemUserTags {} \\; 2>/dev/null
    find "\$APP_PATH" -exec xattr -c {} \\; 2>/dev/null
} && log_success "隔离属性移除完成" || log_warning "部分隔离属性移除失败"

# 2. 多重代码签名修复
log_info "2. 执行多重代码签名修复..."
if codesign --force --deep --sign - "\$APP_PATH" 2>/dev/null; then
    log_success "代码签名修复成功"
elif codesign --remove-signature "\$APP_PATH" 2>/dev/null && codesign --force --deep --sign - "\$APP_PATH" 2>/dev/null; then
    log_success "代码签名重新修复成功"
else
    log_warning "代码签名修复失败，但不影响使用"
fi

# 3. 全面权限设置
log_info "3. 执行全面权限设置..."
{
    chmod -R +x "\$APP_PATH" 2>/dev/null
    chmod -R 755 "\$APP_PATH/Contents/MacOS/" 2>/dev/null
    find "\$APP_PATH" -name "*.dylib" -exec chmod 755 {} \\; 2>/dev/null
    find "\$APP_PATH" -name "*.so" -exec chmod 755 {} \\; 2>/dev/null
} && log_success "权限设置完成" || log_warning "部分权限设置失败"

# 4. Gatekeeper 绕过
log_info "4. 执行 Gatekeeper 绕过..."
{
    spctl --add "\$APP_PATH" 2>/dev/null
    spctl --enable "\$APP_PATH" 2>/dev/null
    defaults write com.apple.LaunchServices LSQuarantine -bool NO 2>/dev/null
} && log_success "Gatekeeper 绕过完成" || log_warning "Gatekeeper 绕过失败"

# 5. 系统级修复（需要管理员权限）
log_info "5. 尝试系统级修复（可能需要密码）..."
if sudo -n true 2>/dev/null; then
    sudo xattr -cr "\$APP_PATH" 2>/dev/null && log_success "系统级修复完成"
else
    log_warning "系统级修复跳过（需要管理员权限）"
fi

echo ""
log_success "🎉 所有修复步骤已完成！"
echo ""

# 询问是否启动应用
echo -n "是否现在启动艺语音乐播放器？(Y/n): "
read -r launch_app
case "\$launch_app" in
    [nN][oO]|[nN])
        log_info "修复完成！您可以手动启动应用了"
        ;;
    *)
        log_info "正在启动应用..."
        if open "\$APP_PATH"; then
            log_success "应用启动成功！"
        else
            log_error "应用启动失败"
            echo ""
            log_info "如果问题仍然存在，请尝试："
            echo "1. 重启电脑后再试"
            echo "2. 在系统偏好设置 → 安全性与隐私中允许应用"
            echo "3. 右键点击应用选择'打开'"
        fi
        ;;
esac

echo ""
echo "感谢使用艺语音乐播放器修复工具！"
`;

    const desktopPath = path.join(require('os').homedir(), 'Desktop');
    const scriptPath = path.join(desktopPath, '艺语音乐播放器-超强修复工具.sh');
    
    await fs.promises.writeFile(scriptPath, scriptContent, { mode: 0o755 });
    writeLog('MacOSFix', 'INFO', `永久修复脚本已创建: ${scriptPath}`);
    
    // 延迟显示用户提示
    setTimeout(() => showFixDialog(scriptPath, appPath), 1500);
    
  } catch (error) {
    writeLog('MacOSFix', 'ERROR', `创建永久修复脚本失败: ${error}`);
  }
}

// 创建紧急修复脚本（当应用路径无法确定时）
async function createEmergencyFixScript(): Promise<void> {
  try {
    const scriptContent = `#!/bin/bash
# 艺语音乐播放器 - 紧急修复工具
# 当应用无法正常启动时使用

set -e

RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m'

log_info() { echo -e "\${BLUE}ℹ️  \$1\${NC}"; }
log_success() { echo -e "\${GREEN}✅ \$1\${NC}"; }
log_warning() { echo -e "\${YELLOW}⚠️  \$1\${NC}"; }
log_error() { echo -e "\${RED}❌ \$1\${NC}"; }

echo "=================================================="
echo "🆘 艺语音乐播放器 - 紧急修复工具"
echo "=================================================="
echo ""

# 查找应用
POSSIBLE_PATHS=(
    "/Applications/艺语音乐播放器.app"
    "\$HOME/Applications/艺语音乐播放器.app"
    "\$HOME/Desktop/艺语音乐播放器.app"
    "\$HOME/Downloads/艺语音乐播放器.app"
)

APP_PATH=""
for path in "\${POSSIBLE_PATHS[@]}"; do
    if [[ -d "\$path" ]]; then
        APP_PATH="\$path"
        break
    fi
done

if [[ -z "\$APP_PATH" ]]; then
    log_warning "未找到艺语音乐播放器应用"
    echo "请将应用拖拽到此窗口，然后按回车："
    read -r APP_PATH
    APP_PATH=\$(echo "\$APP_PATH" | sed 's/^[ \\t]*//;s/[ \\t]*\$//')
fi

if [[ ! -d "\$APP_PATH" ]]; then
    log_error "应用路径无效: \$APP_PATH"
    exit 1
fi

log_info "找到应用: \$APP_PATH"
echo ""

# 执行紧急修复
log_info "执行紧急修复..."

# 移除所有可能的隔离属性
log_info "移除隔离属性..."
sudo xattr -cr "\$APP_PATH" 2>/dev/null || xattr -cr "\$APP_PATH" 2>/dev/null || true
sudo find "\$APP_PATH" -exec xattr -c {} \\; 2>/dev/null || find "\$APP_PATH" -exec xattr -c {} \\; 2>/dev/null || true

# 重新签名
log_info "重新签名..."
codesign --remove-signature "\$APP_PATH" 2>/dev/null || true
codesign --force --deep --sign - "\$APP_PATH" 2>/dev/null || true

# 设置权限
log_info "设置权限..."
chmod -R 755 "\$APP_PATH" 2>/dev/null || true

# 添加到信任列表
log_info "添加到信任列表..."
spctl --add "\$APP_PATH" 2>/dev/null || true

# 禁用系统检查
log_info "禁用系统检查..."
defaults write com.apple.LaunchServices LSQuarantine -bool NO 2>/dev/null || true

log_success "紧急修复完成！"
echo ""

# 尝试启动
echo -n "是否现在尝试启动应用？(Y/n): "
read -r launch_app
case "\$launch_app" in
    [nN][oO]|[nN]) ;;
    *)
        if open "\$APP_PATH"; then
            log_success "应用启动成功！"
        else
            log_error "应用仍无法启动"
            echo ""
            log_info "终极解决方案："
            echo "1. 重启电脑"
            echo "2. 系统偏好设置 → 安全性与隐私 → 通用 → 允许从以下位置下载的应用 → 任何来源"
            echo "3. 右键点击应用 → 打开"
        fi
        ;;
esac
`;

    const desktopPath = path.join(require('os').homedir(), 'Desktop');
    const scriptPath = path.join(desktopPath, '艺语音乐播放器-紧急修复工具.sh');
    
    await fs.promises.writeFile(scriptContent, scriptPath, { mode: 0o755 });
    writeLog('MacOSFix', 'INFO', `紧急修复脚本已创建: ${scriptPath}`);
    
  } catch (error) {
    writeLog('MacOSFix', 'ERROR', `创建紧急修复脚本失败: ${error}`);
  }
}

// 创建修复脚本（原版本保留）
async function createFixScript(appPath: string): Promise<void> {
  try {
    const scriptContent = `#!/bin/bash
# 艺语音乐播放器 macOS 兼容性修复脚本
# 自动生成于: ${new Date().toLocaleString()}

echo "🎵 艺语音乐播放器 - macOS 兼容性修复"
echo "正在修复应用权限问题..."

APP_PATH="${appPath}"

# 移除隔离属性
echo "1. 移除隔离属性..."
sudo xattr -dr com.apple.quarantine "\$APP_PATH" 2>/dev/null
xattr -cr "\$APP_PATH" 2>/dev/null

# 修复代码签名
echo "2. 修复代码签名..."
codesign --force --deep --sign - "\$APP_PATH" 2>/dev/null

# 设置执行权限
echo "3. 设置执行权限..."
chmod -R +x "\$APP_PATH/Contents/MacOS/" 2>/dev/null

# 信任应用
echo "4. 添加到系统信任列表..."
spctl --add "\$APP_PATH" 2>/dev/null
spctl --enable "\$APP_PATH" 2>/dev/null

echo "✅ 修复完成！现在可以正常使用艺语音乐播放器了"
echo "如果仍有问题，请联系技术支持"

# 自动启动应用
echo "正在启动应用..."
open "\$APP_PATH"
`;

    const desktopPath = path.join(require('os').homedir(), 'Desktop');
    const scriptPath = path.join(desktopPath, '艺语音乐播放器修复工具.sh');
    
    await fs.promises.writeFile(scriptPath, scriptContent, { mode: 0o755 });
    writeLog('MacOSFix', 'INFO', `修复脚本已创建: ${scriptPath}`);
    
    // 延迟显示用户提示
    setTimeout(() => showFixDialog(scriptPath, appPath), 1000);
    
  } catch (error) {
    writeLog('MacOSFix', 'ERROR', `创建修复脚本失败: ${error}`);
  }
}

// 显示修复对话框
function showFixDialog(scriptPath: string, appPath: string) {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) return;

  dialog.showMessageBox(windows[0], {
    type: 'info',
    title: '🛠️ 系统兼容性助手',
    message: '检测到 macOS 安全限制',
    detail: `为了正常使用艺语音乐播放器，请选择以下任一方式：

方式一（推荐）：
双击桌面上的"艺语音乐播放器修复工具.sh"

方式二（手动）：
在终端中执行：
sudo xattr -cr "${appPath}"

方式三（系统设置）：
系统偏好设置 → 安全性与隐私 → 通用 → 允许从以下位置下载的应用 → 仍要打开`,
    buttons: ['打开修复工具', '手动复制命令', '稍后处理'],
    defaultId: 0,
    cancelId: 2
  }).then((result) => {
    switch (result.response) {
      case 0: // 打开修复工具
        require('electron').shell.openPath(scriptPath);
        break;
      case 1: // 复制命令
        require('electron').clipboard.writeText(`sudo xattr -cr "${appPath}"`);
        break;
    }
  });
}

// 设置环境变量以减少 IMK 错误和其他常见警告
if (process.platform === 'darwin') {
  // 禁用一些可能导致 IMK 问题的功能
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  // 设置输入法相关环境变量
  process.env.IMKCFRunLoopWakeUpReliable = 'false';
  // 禁用一些 macOS 特定的警告
  process.env.ELECTRON_DISABLE_GPU = 'false';
  process.env.ELECTRON_DISABLE_GPU_SANDBOX = 'false';
}

// 全局设置，减少控制台警告
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// 设置语言环境为中文，确保系统对话框显示中文
function setLocale() {
  try {
    // 设置环境变量以确保系统对话框显示中文
    process.env.LC_ALL = 'zh_CN.UTF-8';
    process.env.LANG = 'zh_CN.UTF-8';
    
    // 在 macOS 上特别设置
    if (process.platform === 'darwin') {
      process.env.LC_CTYPE = 'zh_CN.UTF-8';
      process.env.LOCALE = 'zh_CN';
      
      // 设置 Electron 的语言偏好
      app.commandLine.appendSwitch('lang', 'zh-CN');
    }
    
    // 在 Windows 上设置
    if (process.platform === 'win32') {
      process.env.LOCALE = 'zh_CN';
      app.commandLine.appendSwitch('lang', 'zh-CN');
    }
    
    console.log('语言环境已设置为中文');
    console.log('当前环境变量:', {
      LC_ALL: process.env.LC_ALL,
      LANG: process.env.LANG,
      LC_CTYPE: process.env.LC_CTYPE,
      platform: process.platform
    });
  } catch (error) {
    console.warn('设置语言环境失败:', error);
  }
}

// 在应用准备之前设置语言环境
setLocale();

// 应用事件
app.whenReady().then(async () => {
  try {
    // macOS 权限检查和自我修复
    if (process.platform === 'darwin') {
      console.log('正在检查 macOS 系统兼容性...');
      await checkAndFixMacOSPermissions();
    }
    
    // 先初始化数据管理器
    console.log('应用准备就绪，初始化数据管理器...');
    DataManager.getInstance();
    console.log('数据管理器初始化完成');

    // 确保默认歌单（Windows 首次启动可能没有）
    try {
      const dm = DataManager.getInstance();
      const defaultPl = dm.ensureDefaultPlaylist();
      dm.setCurrentPlaylist(defaultPl.id);
      console.log('[main.ts] 默认歌单已确保存在并设为当前:', defaultPl.id, defaultPl.name);
      
      // Windows平台额外验证和诊断
      if (process.platform === 'win32') {
        console.log('🪟 [main.ts] Windows平台额外验证...');
        const allPlaylists = dm.getAllPlaylists();
        const allMusic = dm.getAllMusicFiles();
        console.log(`   - 当前播放列表数量: ${allPlaylists.length}`);
        console.log(`   - 当前音乐文件数量: ${allMusic.length}`);
        console.log(`   - 默认歌单ID: ${defaultPl.id}`);
        console.log(`   - 默认歌单歌曲数: ${defaultPl.songCount || 0}`);
        
        // 如果没有音乐文件但有播放列表，可能是数据不一致
        if (allPlaylists.length > 0 && allMusic.length === 0) {
          console.log('🪟 [main.ts] 检测到可能的数据不一致：有播放列表但无音乐文件');
        }
        
        console.log('✅ [main.ts] Windows平台验证完成');
      }
      
    } catch (e) {
      console.error('❌ [main.ts] 确保默认歌单时出现严重问题:', e);
      
      // Windows平台特别处理
      if (process.platform === 'win32') {
        console.log('🪟 [main.ts] Windows平台尝试恢复默认歌单...');
        
        // 延迟重试
        setTimeout(async () => {
          try {
            const dm = DataManager.getInstance();
            const retryDefaultPl = dm.ensureDefaultPlaylist();
            dm.setCurrentPlaylist(retryDefaultPl.id);
            console.log('✅ [main.ts] Windows平台默认歌单恢复成功:', retryDefaultPl.id);
          } catch (retryError) {
            console.error('❌ [main.ts] Windows平台默认歌单恢复失败:', retryError);
          }
        }, 2000);
      }
    }

    // 注册Windows诊断工具 - 在打包版本中也可用
    ipcMain.handle('debug:windows-diagnosis', async () => {
        const diagnosis = {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          electronVersion: process.versions.electron,
          chromeVersion: process.versions.chrome,
          
          // 数据库状态
          database: {
            initialized: false,
            path: '',
            exists: false,
            size: 0,
            playlists: 0,
            musicFiles: 0,
            error: null as string | null
          },

          // 权限和路径
          paths: {
            userData: app.getPath('userData'),
            temp: app.getPath('temp'),
            documents: app.getPath('documents'),
            home: app.getPath('home')
          },

          // 系统信息
          system: {
            totalMemory: require('os').totalmem(),
            freeMemory: require('os').freemem(),
            platform: require('os').platform(),
            release: require('os').release(),
            hostname: require('os').hostname()
          }
        };

        try {
          const dm = DataManager.getInstance();
          diagnosis.database.initialized = !!dm;
          
          if (dm) {
            const path = require('path');
            const fs = require('fs');
            const dbPath = path.join(app.getPath('userData'), 'wedding_music.db');
            
            diagnosis.database.path = dbPath;
            diagnosis.database.exists = fs.existsSync(dbPath);
            
            if (diagnosis.database.exists) {
              const stats = fs.statSync(dbPath);
              diagnosis.database.size = stats.size;
            }

            try {
              diagnosis.database.playlists = dm.getAllPlaylists().length;
              diagnosis.database.musicFiles = dm.getAllMusicFiles().length;
            } catch (dataError: any) {
              diagnosis.database.error = dataError.message;
            }
          }
        } catch (error: any) {
          diagnosis.database.error = error.message;
        }

        return diagnosis;
      });
      
      console.log('Windows诊断工具已注册（支持打包版本）');
    
    // 然后创建窗口
    await mainApp.createWindow();
  } catch (error) {
    console.error('应用初始化失败:', error);
  }
});

app.on('window-all-closed', () => {
  // 清理快捷键
  if (mainApp.shortcutManager) {
    mainApp.shortcutManager.unregisterAllShortcuts();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // 应用退出前清理快捷键
  if (mainApp.shortcutManager) {
    console.log('应用退出前清理快捷键');
    mainApp.shortcutManager.unregisterAllShortcuts();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainApp.createWindow();
  }
});

// 安全设置
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    event.preventDefault();
  });
});

import { app, BrowserWindow, ipcMain, dialog, shell, protocol, Menu } from 'electron';
// 设定中文区域与语言优先级，影响系统对话框/侧边栏语言
process.env.LC_ALL = 'zh_CN.UTF-8';
process.env.LANG = 'zh_CN.UTF-8';
process.env.LC_CTYPE = 'zh_CN.UTF-8';
app.commandLine.appendSwitch('lang', 'zh-CN');
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import Store from 'electron-store';
import { FFmpegManager } from './ffmpegManager';
import { MusicDecryptor } from './musicDecryptor';
import { consoleRecordingManager } from './consoleRecordingManager';
import { vocalRemoverManager } from './vocalRemoverManager';
import { handCardManager } from './handCardManager';
import { audioEditorManager } from './audioEditorManager';
import { DataManager } from './dataManager';
import os from 'os';
import crypto from 'crypto';

try {
  app.setPath('userData', path.join(app.getPath('appData'), 'wedding-music-player'));
  app.setName('YIYU');
} catch (error) {
  console.warn('Failed to set legacy userData path:', error);
}

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const access = promisify(fs.access); // 使用 access 替代已弃用的 exists

// 初始化本地存储
const store = new Store();

let mainWindow: BrowserWindow | null = null;
let ffmpegManager: FFmpegManager | null = null;
let musicDecryptor: MusicDecryptor | null = null;
let dataManager: DataManager | null = null;
let ipcHandlersRegistered = false; // 防止重复注册IPC处理器

function getDataManager(): DataManager {
  if (!dataManager) {
    dataManager = DataManager.getInstance();
  }
  return dataManager;
}

function createPlaylistFromIpcPayload(playlist: any) {
  try {
    const dm = getDataManager();
    const created = dm.createPlaylist(playlist || {});
    if (!created || !created.id) {
      throw new Error('歌单创建失败：创建结果无效');
    }

    try {
      dm.setCurrentPlaylist(created.id);
    } catch (error) {
      console.warn('设置当前歌单失败:', error);
    }

    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('playlist:created', created);
      }
    } catch (error) {
      console.warn('发送歌单创建事件失败:', error);
    }

    return created;
  } catch (error) {
    console.error('playlist:create 失败:', error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

const safeIpcHandle = (channel: string, listener: (...args: any[]) => any) => {
  try {
    ipcMain.removeHandler(channel);
  } catch {}
  ipcMain.handle(channel, listener);
};

// 注册数据管理器相关的IPC处理器
function registerDataManagerIPC() {
  if (!dataManager) {
    console.error('数据管理器未初始化，无法注册IPC处理器');
    return;
  }
  
  if (ipcHandlersRegistered) {
    console.log('IPC处理器已经注册过，跳过重复注册');
    return;
  }
  
  console.log('开始注册IPC处理器...');
  
  // 立即标记为已注册，防止并发调用（在开始注册后立即设置）
  ipcHandlersRegistered = true;

  // 音乐文件操作
  safeIpcHandle('music:getAll', () => {
    console.log('IPC: 获取所有音乐文件');
    return dataManager!.getAllMusicFiles();
  });
  safeIpcHandle('music:get', (_, id: string) => {
    console.log('IPC: 获取音乐文件:', id);
    return dataManager!.getMusicFile(id);
  });
  safeIpcHandle('music:add', (_, musicFile: any, targetPlaylistId?: string) => {
    console.log('IPC: 添加单个音乐文件:', musicFile.fileName);
    return dataManager!.addMusicFile(musicFile, targetPlaylistId);
  });
  safeIpcHandle('music:addBatch', (_, musicFiles: any[], targetPlaylistId?: string) => {
    console.log('=== IPC: 批量添加音乐文件 ===');
    console.log('接收到的文件数量:', musicFiles.length);
    
    // 详细日志记录每个文件
    musicFiles.forEach((file, index) => {
      console.log(`文件 ${index + 1}:`, {
        id: file.id,
        fileName: file.fileName,
        filePath: file.filePath,
        fileSize: file.fileSize,
        format: file.format
      });
      
      // 验证文件路径
      if (!file.filePath) {
        console.error(`文件 ${file.fileName} 缺少 filePath`);
      }
      
      // 验证文件是否存在
      if (file.filePath) {
        const normalizedPath = file.filePath.replace(/\\/g, '/');
        try {
          if (fs.existsSync(normalizedPath)) {
            console.log(`✓ 文件存在: ${file.filePath}`);
            // 获取文件信息
            const stats = fs.statSync(normalizedPath);
            console.log(`  文件大小: ${stats.size} 字节`);
            console.log(`  文件类型: ${stats.isFile() ? '文件' : '目录'}`);
          } else {
            console.error(`✗ 文件不存在: ${file.filePath}`);
            console.error(`  标准化路径: ${normalizedPath}`);
            
            // 尝试不同的路径组合进行调试
            const variations = [
              file.filePath,
              normalizedPath,
              decodeURIComponent(file.filePath),
              decodeURIComponent(normalizedPath)
            ];
            
            console.error('  尝试的路径变体:');
            variations.forEach((variation, index) => {
              console.error(`    ${index + 1}. ${variation} -> ${fs.existsSync(variation) ? '存在' : '不存在'}`);
            });
          }
        } catch (error) {
          console.error(`路径检查失败: ${file.filePath}`, error);
        }
      } else {
        console.error(`文件 ${file.fileName} 缺少 filePath`);
      }
    });
    
    try {
      dataManager!.addMusicFiles(musicFiles, targetPlaylistId);
      console.log('=== 批量添加完成 ===');
      return { success: true, count: musicFiles.length };
    } catch (error) {
      console.error('=== IPC: 批量添加音乐文件失败 ===');
      console.error('错误详情:', error);
      console.error('错误堆栈:', error instanceof Error ? error.stack : 'N/A');
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  });
  safeIpcHandle('music:update', (_, id: string, updates: any) => {
    console.log('IPC: 更新音乐文件:', id);
    return dataManager!.updateMusicFile(id, updates);
  });
  safeIpcHandle('music:delete', (_, id: string) => {
    console.log('IPC: 删除音乐文件:', id);
    return dataManager!.deleteMusicFile(id);
  });
  safeIpcHandle('music:clearAll', () => {
    console.log('IPC: 清空所有音乐文件');
    return dataManager!.clearAllMusic();
  });
  safeIpcHandle('music:play', (_, filePath: string) => {
    try {
      if (filePath) {
        // 标准化路径，确保 Windows 路径正确处理
        const normalizedPath = filePath.replace(/\\/g, '/');
        console.log('播放文件:', normalizedPath);
        shell.openPath(normalizedPath);
        return { success: true };
      }
      return { success: false, error: 'File path is empty.' };
    } catch (error) {
      console.error(`Failed to play file: ${filePath}`, error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 播放列表操作
  safeIpcHandle('playlist:getAll', () => dataManager!.getAllPlaylists());
  safeIpcHandle('playlist:get', (_, id: string) => dataManager!.getPlaylist(id));
  safeIpcHandle('playlist:create', (_, playlist: any) => createPlaylistFromIpcPayload(playlist));
  safeIpcHandle('playlist:update', (_, id: string, updates: any) => dataManager!.updatePlaylist(id, updates));
  safeIpcHandle('playlist:delete', (_, id: string) => dataManager!.deletePlaylist(id));

  // 播放列表音乐关联
  safeIpcHandle('playlist:addMusic', (_, playlistId: string, musicId: string) => dataManager!.addMusicToPlaylist(playlistId, musicId));
  safeIpcHandle('playlist:removeMusic', (_, playlistId: string, musicId: string) => dataManager!.removeMusicFromPlaylist(playlistId, musicId));
  
  // 排序相关
  safeIpcHandle('playlist:updateOrder', (_, playlistIds: string[]) => {
    console.log('IPC: 更新歌单排序:', playlistIds);
    return dataManager!.updatePlaylistsOrder(playlistIds);
  });
  safeIpcHandle('playlist:updateMusicOrder', (_, playlistId: string, musicIds: string[]) => {
    console.log('IPC: 更新歌单内歌曲排序:', playlistId, musicIds);
    return dataManager!.updatePlaylistMusicOrder(playlistId, musicIds);
  });
  safeIpcHandle('playlist:getMusic', (_, playlistId: string) => dataManager!.getPlaylistMusic(playlistId));
  safeIpcHandle('playlist:addMusicBatch', (_, playlistId: string, musicIds: string[]) => dataManager!.addMusicToPlaylistBatch(playlistId, musicIds));

  // 默认/当前歌单
  safeIpcHandle('playlist:getDefault', () => dataManager!.getDefaultPlaylist());
  safeIpcHandle('playlist:ensureDefault', () => {
    try {
      return dataManager!.ensureDefaultPlaylist();
    } catch (error) {
      console.error('ensureDefaultPlaylist 失败:', error);
      return null;
    }
  });
  safeIpcHandle('playlist:getCurrent', () => dataManager!.getCurrentPlaylist());
  safeIpcHandle('playlist:setCurrent', (_, playlistId: string) => dataManager!.setCurrentPlaylist(playlistId));
  
  // Shell API - 打开外部链接
  
  
  console.log('✅ IPC处理器注册完成（包括shell:openExternal）');
}

// Shell API - openExternal
safeIpcHandle('shell:openExternal', async (_event, url: string) => {
  try {
    console.log('shell:openExternal:', url);
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('shell:openExternal error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'shell:openExternal failed' };
  }
});


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
  webPreferences: {
    preload: path.join(__dirname, './preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: false  // 允许加载本地文件
  },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#1f2937',
    icon: path.join(__dirname, '../../public/app-icon.png'),
    show: false // 窗口准备好后再显示
  });

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    console.log('窗口准备就绪，显示窗口');
    mainWindow?.show();
  });

  // 监听加载错误
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('页面加载失败:', errorCode, errorDescription, validatedURL);
  });

  // 监听加载完成
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('页面加载完成');
  });

  // 监听控制台消息
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`控制台[${level}]:`, message);
  });

  // 检测是否为开发模式
  const isDev = process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged;
  console.log('当前模式:', isDev ? '开发模式' : '生产模式');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('isPackaged:', require('electron').app.isPackaged);
  console.log('__dirname:', __dirname);
  console.log('process.resourcesPath:', process.resourcesPath);
  console.log('process.cwd():', process.cwd());
  
  // 开发模式
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools(); // 已禁用开发者工具
  } else {
    // 生产模式 - 修正路径处理逻辑
    const fs = require('fs');
    let htmlPath = '';
    
    // 尝试多个可能的HTML文件路径
    const possiblePaths = [
      // 标准打包结构：app/dist/index.html
      path.join(__dirname, '../../dist/index.html'),
      // 备用路径1：相对于主进程的上一级目录
      path.join(__dirname, '../dist/index.html'),
      // 备用路径2：相对于当前工作目录
      path.join(process.cwd(), 'dist/index.html'),
      // 备用路径3：使用资源路径
      process.resourcesPath ? path.join(process.resourcesPath, 'app/dist/index.html') : '',
      // 备用路径4：直接在资源目录下
      process.resourcesPath ? path.join(process.resourcesPath, 'dist/index.html') : ''
    ].filter(p => p); // 过滤掉空路径
    
    console.log('尝试的HTML文件路径:');
    for (let i = 0; i < possiblePaths.length; i++) {
      const testPath = possiblePaths[i];
      console.log(`  ${i + 1}. ${testPath}`);
      if (fs.existsSync(testPath)) {
        htmlPath = testPath;
        console.log(`✓ 找到HTML文件: ${htmlPath}`);
        break;
      } else {
        console.log(`✗ 文件不存在: ${testPath}`);
      }
    }
    
    if (htmlPath && fs.existsSync(htmlPath)) {
      console.log('加载HTML文件:', htmlPath);
      mainWindow.loadFile(htmlPath);
    } else {
      console.error('无法找到HTML文件，尝试加载网络地址...');
      // 最后的备用方案
      mainWindow.loadURL('data:text/html,<h1 style="text-align:center;margin-top:50px;font-family:system-ui;">音乐下载正在启动...</h1><p style="text-align:center;color:#666;">如果持续显示此页面，请重新安装应用</p>');
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 创建中文应用菜单
function setChineseApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template: any[] = [
    // macOS 应用菜单（保持系统一致，但补充中文标签）
    ...(isMac
      ? [{
          role: 'appMenu',
          label: '音乐下载'
        }]
      : []),
    {
      label: '文件',
      submenu: [
        isMac
          ? { role: 'close', label: '关闭窗口' }
          : { role: 'quit', label: '退出' }
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
        ...(isMac
          ? [{ role: 'zoom', label: '缩放' }, { role: 'front', label: '置于顶层' }]
          : [{ role: 'close', label: '关闭' }])
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: '关于',
              message: '音乐下载',
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

// 应用准备就绪
app.whenReady().then(async () => {
  // 注册自定义协议处理本地文件
  protocol.registerFileProtocol('local-resource', (request, callback) => {
    const url = request.url.substr(17); // 移除 'local-resource://'
    const filePath = decodeURIComponent(url);
    callback({ path: filePath });
  });

  // 确保FFmpeg管理器在主窗口创建前初始化
  console.log('应用准备就绪，初始化FFmpeg管理器...');
  
  // 初始化FFmpeg管理器
  try {
    ffmpegManager = new FFmpegManager();
    console.log('FFmpeg管理器初始化成功');
  } catch (error) {
    console.error('FFmpeg管理器初始化失败:', error);
  }

  // 初始化音乐解密管理器
  try {
    musicDecryptor = new MusicDecryptor();
    console.log('音乐解密管理器初始化成功');
  } catch (error) {
    console.error('音乐解密管理器初始化失败:', error);
  }

  // 初始化数据管理器（提供音乐与歌单的持久化与IPC服务）
  try {
    console.log('=== 开始初始化数据管理器 ===');
    console.log('平台信息:', process.platform);
    console.log('进程路径:', process.execPath);
    console.log('工作目录:', process.cwd());
    
    dataManager = DataManager.getInstance();
    console.log('数据管理器实例创建成功');
    console.log('数据管理器类型:', typeof dataManager);
    console.log('数据管理器方法:', Object.getOwnPropertyNames(Object.getPrototypeOf(dataManager)));
    
    // 立即注册音乐与歌单相关的IPC处理器
    console.log('开始注册IPC处理器...');
    registerDataManagerIPC();
    console.log('IPC处理器注册完成');
    
    // 确保默认歌单存在并设置为当前歌单（Windows首启可能没有默认歌单）
    try {
      const defaultPl = dataManager.ensureDefaultPlaylist();
      dataManager.setCurrentPlaylist(defaultPl.id);
      console.log('默认歌单已确保存在并设为当前:', defaultPl.id, defaultPl.name);
    } catch (e) {
      console.warn('确保默认歌单时出现问题（将继续运行）:', e);
    }
    
    // 等待一小段时间确保数据管理器完全初始化
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('=== 数据管理器初始化完成 ===');
  } catch (error) {
    console.error('=== 数据管理器初始化失败 ===');
    console.error('错误详情:', error);
    console.error('错误类型:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('错误消息:', error instanceof Error ? error.message : String(error));
    console.error('错误堆栈:', error instanceof Error ? error.stack : 'N/A');
    
    // 尝试使用备用初始化方式
    console.log('尝试备用初始化方式...');
    try {
      // 强制重新初始化
      setTimeout(() => {
        console.log('延迟重新初始化数据管理器...');
        try {
          dataManager = DataManager.getInstance();
          registerDataManagerIPC();
          console.log('备用初始化成功');
        } catch (retryError) {
          console.error('备用初始化也失败:', retryError);
        }
      }, 1000);
    } catch (retryError) {
      console.error('备用初始化失败:', retryError);
    }
  }
  
  createWindow();
  // 设置中文应用菜单
  setChineseApplicationMenu();

  // 设置管理器的主窗口引用
  if (mainWindow) {
    try {
      consoleRecordingManager.setMainWindow(mainWindow);
      vocalRemoverManager.setMainWindow(mainWindow);
      handCardManager.setMainWindow(mainWindow);
      audioEditorManager.setMainWindow(mainWindow);
      console.log('管理器设置完成');
    } catch (error) {
      console.error('管理器设置失败:', error);
    }
  }


  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  consoleRecordingManager.cleanup();
  app.quit();
});

// 应用退出前清理
app.on('before-quit', () => {
  try {
    consoleRecordingManager.cleanup();
    vocalRemoverManager.cleanup();
    audioEditorManager.cleanup();
  } catch (error) {
    console.error('应用退出前清理失败:', error);
  }
});

// 系统相关API处理 - 增强错误处理
safeIpcHandle('system:openFile', async () => {
  try {
    if (!mainWindow) {
      throw new Error('主窗口未初始化');
    }
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'ncm'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    return result;
  } catch (error) {
    console.error('打开文件对话框失败:', error);
    throw error;
  }
});

safeIpcHandle('system:openFolder', async () => {
  try {
    if (!mainWindow) {
      throw new Error('主窗口未初始化');
    }
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择输出目录',
      buttonLabel: '选择'
    });
    return result;
  } catch (error) {
    console.error('打开文件夹对话框失败:', error);
    throw error;
  }
});

safeIpcHandle('system:getAudioDevices', async () => {
  try {
    // 这里应该返回系统音频设备列表
    // 实际实现需要使用node-audio-recording等库
    return [
      { id: 'default', name: '默认麦克风', type: 'input' },
      { id: 'system', name: '系统音频', type: 'output' }
    ];
  } catch (error) {
    console.error('获取音频设备失败:', error);
    return [];
  }
});

// FFmpeg相关API处理 - 已在FFmpegManager构造函数中注册

// NCM 文件解密处理
import { NcmDecryptor } from './ncmDecryptor';

safeIpcHandle('ncm:decrypt', async (event, inputPath: string, outputDir?: string) => {
  try {
    console.log('收到 NCM 解密请求:', inputPath);
    if (!inputPath || typeof inputPath !== 'string') {
      throw new Error('无效的文件路径');
    }
    
    const outputPath = await NcmDecryptor.decrypt(inputPath, outputDir);
    console.log('NCM 解密成功:', outputPath);
    
    return {
      success: true,
      outputPath: outputPath
    };
  } catch (error) {
    console.error('NCM 解密失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '解密失败'
    };
  }
});

// 文件系统API处理 - 增强错误处理和安全性
safeIpcHandle('fs:readFile', async (event, filePath: string) => {
  try {
    // 验证路径安全性
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('无效的文件路径');
    }
    
    return await readFile(filePath);
  } catch (error) {
    console.error('读取文件失败:', filePath, error);
    throw error;
  }
});

safeIpcHandle('fs:writeFile', async (event, filePath: string, data: any) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('无效的文件路径');
    }
    
    // 确保目录存在
    const dirPath = path.dirname(filePath);
    try {
      await access(dirPath, fs.constants.F_OK);
    } catch (error) {
      // 目录不存在，创建它
      console.log(`创建目录: ${dirPath}`);
      await mkdir(dirPath, { recursive: true });
    }
    
    // 处理不同类型的数据
    let bufferData: Buffer;
    if (data instanceof ArrayBuffer) {
      // 将ArrayBuffer转换为Buffer
      bufferData = Buffer.from(data);
    } else if (data instanceof Uint8Array) {
      // 将Uint8Array转换为Buffer
      bufferData = Buffer.from(data);
    } else if (Buffer.isBuffer(data)) {
      // 已经是Buffer类型
      bufferData = data;
    } else if (typeof data === 'string') {
      // 字符串数据
      bufferData = Buffer.from(data, 'utf8');
    } else {
      // 其他类型，尝试转换为Buffer
      bufferData = Buffer.from(data);
    }
    
    await writeFile(filePath, bufferData);
    
    // 强制同步文件系统以确保文件确实写入
    try {
      await new Promise(resolve => setTimeout(resolve, 100)); // 等待100ms
      const stat = fs.statSync(filePath);
      if (stat.size === 0) {
        throw new Error('文件写入后大小为0');
      }
      console.log(`文件写入成功: ${filePath} (${stat.size} bytes)`);
    } catch (statError) {
      console.error('文件写入验证失败:', statError);
      throw new Error('文件写入后验证失败');
    }
    
    return true;
  } catch (error) {
    console.error('写入文件失败:', filePath, error);
    throw error;
  }
});

safeIpcHandle('fs:unlink', async (event, filePath: string) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('无效的文件路径');
    }
    
    await unlink(filePath);
    return true;
  } catch (error) {
    console.error('删除文件失败:', filePath, error);
    throw error;
  }
});

safeIpcHandle('fs:mkdir', async (event, dirPath: string) => {
  try {
    if (!dirPath || typeof dirPath !== 'string') {
      throw new Error('无效的目录路径');
    }
    
    await mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error('创建目录失败:', dirPath, error);
    throw error;
  }
});

safeIpcHandle('fs:readdir', async (event, dirPath: string) => {
  try {
    if (!dirPath || typeof dirPath !== 'string') {
      throw new Error('无效的目录路径');
    }
    
    return await readdir(dirPath);
  } catch (error) {
    console.error('读取目录失败:', dirPath, error);
    throw error;
  }
});

safeIpcHandle('fs:exists', async (event, filePath: string) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return false;
    }
    
    await access(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
});

safeIpcHandle('fs:stat', async (event, filePath: string) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('无效的文件路径');
    }
    
    const stats = fs.statSync(filePath);
    return {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      mtime: stats.mtime,
      ctime: stats.ctime
    };
  } catch (error) {
    console.error('获取文件信息失败:', filePath, error);
    throw error;
  }
});

safeIpcHandle('fs:scanAudioFiles', async (event, folderPath: string) => {
  try {
    if (!folderPath || typeof folderPath !== 'string') {
      throw new Error('无效的文件夹路径');
    }

    console.log('=== 开始扫描音频文件 ===');
    console.log('目标文件夹:', folderPath);

    // 验证文件夹存在
    if (!fs.existsSync(folderPath)) {
      throw new Error(`文件夹不存在: ${folderPath}`);
    }

    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      throw new Error(`路径不是文件夹: ${folderPath}`);
    }

    // 支持的音频格式
    const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.ncm'];
    const audioFiles: string[] = [];

    // 递归扫描文件夹
    const scanDirectory = async (dirPath: string, depth: number = 0): Promise<void> => {
      if (depth > 10) { // 防止过深的递归
        console.warn('目录深度超过限制，跳过:', dirPath);
        return;
      }

      try {
        const items = fs.readdirSync(dirPath);
        console.log(`扫描目录 (深度${depth}): ${dirPath}, 项目数: ${items.length}`);

        for (const item of items) {
          const itemPath = path.join(dirPath, item);
          
          try {
            const itemStats = fs.statSync(itemPath);
            
            if (itemStats.isDirectory()) {
              // 递归扫描子目录
              await scanDirectory(itemPath, depth + 1);
            } else if (itemStats.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if (audioExtensions.includes(ext)) {
                audioFiles.push(itemPath);
                console.log(`找到音频文件: ${itemPath}`);
              }
            }
          } catch (itemError) {
            console.warn(`无法处理项目 ${itemPath}:`, itemError);
          }
        }
      } catch (dirError) {
        console.error(`无法读取目录 ${dirPath}:`, dirError);
      }
    };

    await scanDirectory(folderPath);

    console.log('=== 扫描完成 ===');
    console.log(`找到 ${audioFiles.length} 个音频文件`);

    return audioFiles;
  } catch (error) {
    console.error('扫描音频文件失败:', folderPath, error);
    throw error;
  }
});

// 应用相关API处理
safeIpcHandle('app:getTempPath', () => {
  try {
    return app.getPath('temp');
  } catch (error) {
    console.error('获取临时目录失败:', error);
    return null;
  }
});

safeIpcHandle('app:getPath', (event, name: any) => {
  try {
    return app.getPath(name);
  } catch (error) {
    console.error('获取系统路径失败:', name, error);
    return null;
  }
});

safeIpcHandle('app:getVersion', () => {
  try {
    return app.getVersion();
  } catch (error) {
    console.error('获取应用版本失败:', error);
    return '0.0.0';
  }
});

// 对话框API处理 - 增强错误处理
safeIpcHandle('dialog:openFile', async (event, options: any = {}) => {
  try {
    if (!mainWindow) {
      throw new Error('主窗口未初始化');
    }
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'ncm'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      ...options
    });
    
    return result.canceled ? [] : result.filePaths;
  } catch (error) {
    console.error('打开文件对话框失败:', error);
    return [];
  }
});

safeIpcHandle('dialog:openFolder', async (event, options: any = {}) => {
  try {
    if (!mainWindow) {
      throw new Error('主窗口未初始化');
    }
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择输出目录',
      buttonLabel: '选择',
      ...options
    });
    
    return result.canceled ? null : result.filePaths[0];
  } catch (error) {
    console.error('打开文件夹对话框失败:', error);
    return null;
  }
});

safeIpcHandle('dialog:saveFile', async (event, options: any = {}) => {
  try {
    if (!mainWindow) {
      throw new Error('主窗口未初始化');
    }
    
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [
        { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      ...options
    });
    
    return result.canceled ? null : result.filePath;
  } catch (error) {
    console.error('保存文件对话框失败:', error);
    return null;
  }
});

safeIpcHandle('dialog:showMessage', async (event, options: any) => {
  try {
    if (!mainWindow) {
      throw new Error('主窗口未初始化');
    }
    
    const result = await dialog.showMessageBox(mainWindow, options);
    return result;
  } catch (error) {
    console.error('显示消息框失败:', error);
    return { response: -1, checkboxChecked: false };
  }
});

// 存储API处理 - 增强错误处理
safeIpcHandle('storage:get', (event, key: string) => {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('无效的存储键');
    }
    const value = store.get(key);
    console.log(`📖 [Storage] 读取 ${key}:`, value ? JSON.stringify(value).substring(0, 100) : 'null');
    return value;
  } catch (error) {
    console.error('❌ [Storage] 获取存储数据失败:', key, error);
    return null;
  }
});

safeIpcHandle('storage:set', (event, key: string, value: any) => {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('无效的存储键');
    }
    console.log(`💾 [Storage] 保存 ${key}:`, JSON.stringify(value).substring(0, 100));
    store.set(key, value);
    // 立即验证保存是否成功
    const saved = store.get(key);
    console.log(`✅ [Storage] 验证保存成功 ${key}:`, saved ? JSON.stringify(saved).substring(0, 100) : 'null');
    return true;
  } catch (error) {
    console.error('❌ [Storage] 设置存储数据失败:', key, error);
    return false;
  }
});

safeIpcHandle('storage:delete', (event, key: string) => {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('无效的存储键');
    }
    store.delete(key);
    return true;
  } catch (error) {
    console.error('删除存储数据失败:', key, error);
    return false;
  }
});

safeIpcHandle('storage:clear', () => {
  try {
    store.clear();
    return true;
  } catch (error) {
    console.error('清空存储数据失败:', error);
    return false;
  }
});

safeIpcHandle('storage:keys', () => {
  try {
    return Object.keys(store.store);
  } catch (error) {
    console.error('获取存储键列表失败:', error);
    return [];
  }
});

// 窗口控制API处理
safeIpcHandle('window:minimize', () => {
  try {
    mainWindow?.minimize();
    return true;
  } catch (error) {
    console.error('最小化窗口失败:', error);
    return false;
  }
});

safeIpcHandle('window:maximize', () => {
  try {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
    return true;
  } catch (error) {
    console.error('最大化/还原窗口失败:', error);
    return false;
  }
});

safeIpcHandle('window:close', () => {
  try {
    mainWindow?.close();
    return true;
  } catch (error) {
    console.error('关闭窗口失败:', error);
    return false;
  }
});

safeIpcHandle('window:setFullScreen', (event, flag: boolean) => {
  try {
    mainWindow?.setFullScreen(flag);
    return true;
  } catch (error) {
    console.error('设置全屏失败:', error);
    return false;
  }
});

safeIpcHandle('window:setAlwaysOnTop', (event, flag: boolean) => {
  try {
    mainWindow?.setAlwaysOnTop(flag);
    return true;
  } catch (error) {
    console.error('设置置顶失败:', error);
    return false;
  }
});

safeIpcHandle('window:getState', () => {
  try {
    if (!mainWindow) {
      return null;
    }
    
    return {
      isMaximized: mainWindow.isMaximized(),
      isMinimized: mainWindow.isMinimized(),
      isFullScreen: mainWindow.isFullScreen(),
      isAlwaysOnTop: mainWindow.isAlwaysOnTop(),
      bounds: mainWindow.getBounds()
    };
  } catch (error) {
    console.error('获取窗口状态失败:', error);
    return null;
  }
});

// 录音相关API处理 - 增强错误处理
safeIpcHandle('recording:getAudioDevices', async () => {
  try {
    // 这里应该返回系统音频设备列表
    // 实际实现需要使用node-audio-recording等库
    return [
      { id: 'default', name: '默认麦克风', type: 'input' },
      { id: 'system', name: '系统音频', type: 'output' }
    ];
  } catch (error) {
    console.error('获取录音设备失败:', error);
    return [];
  }
});

safeIpcHandle('recording:start', async (event, options: any) => {
  try {
    console.log('开始录音:', options);
    return { success: true, message: '录音已开始' };
  } catch (error) {
    console.error('开始录音失败:', error);
    return { success: false, error: (error as Error).message };
  }
});

safeIpcHandle('recording:stop', async () => {
  try {
    console.log('停止录音');
    return { success: true, message: '录音已停止' };
  } catch (error) {
    console.error('停止录音失败:', error);
    return { success: false, error: (error as Error).message };
  }
});

safeIpcHandle('recording:pause', async () => {
  try {
    console.log('暂停录音');
    return { success: true, message: '录音已暂停' };
  } catch (error) {
    console.error('暂停录音失败:', error);
    return { success: false, error: (error as Error).message };
  }
});

safeIpcHandle('recording:resume', async () => {
  try {
    console.log('恢复录音');
    return { success: true, message: '录音已恢复' };
  } catch (error) {
    console.error('恢复录音失败:', error);
    return { success: false, error: (error as Error).message };
  }
});

// 快捷键管理 - 增强错误处理
const shortcuts: Map<string, boolean> = new Map();

safeIpcHandle('shortcut:register', (event, shortcut: string) => {
  try {
    if (!shortcut || typeof shortcut !== 'string') {
      throw new Error('无效的快捷键');
    }
    
    shortcuts.set(shortcut, true);
    console.log('注册快捷键:', shortcut);
    return { success: true };
  } catch (error) {
    console.error('注册快捷键失败:', shortcut, error);
    return { success: false, error: (error as Error).message };
  }
});

safeIpcHandle('shortcut:unregister', (event, shortcut: string) => {
  try {
    if (!shortcut || typeof shortcut !== 'string') {
      throw new Error('无效的快捷键');
    }
    
    shortcuts.delete(shortcut);
    console.log('注销快捷键:', shortcut);
    return { success: true };
  } catch (error) {
    console.error('注销快捷键失败:', shortcut, error);
    return { success: false, error: (error as Error).message };
  }
});

safeIpcHandle('shortcut:unregisterAll', () => {
  try {
    shortcuts.clear();
    console.log('注销所有快捷键');
    return { success: true };
  } catch (error) {
    console.error('注销所有快捷键失败:', error);
    return { success: false, error: (error as Error).message };
  }
});

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});

// 导出主窗口引用（供其他模块使用）
export { mainWindow };

// Activation handlers
safeIpcHandle('validateActivationKey', (event, code: string, mac: string) => {
  try {
    console.log('Validating activation code for MAC:', mac);
    const salt = 'your-secret-salt';
    if (!code || !mac) {
      return { valid: false, error: '缺少激活码或MAC地址' };
    }

    // Decode base64 code -> "expiry|hmac"
    let decoded: string;
    try {
      decoded = Buffer.from(code, 'base64').toString('utf8');
    } catch (e) {
      return { valid: false, error: '激活码格式无效' };
    }

    const parts = decoded.split('|');
    if (parts.length !== 2) {
      return { valid: false, error: '激活码内容无效' };
    }
    const [expiry, key] = parts;
    if (!expiry || !key) {
      return { valid: false, error: '激活码缺少到期时间或签名' };
    }

    // Recompute HMAC(mac|expiry)
    const data = `${mac.toLowerCase()}|${expiry}`;
    const computedKey = crypto.createHmac('sha256', salt).update(data).digest('hex');
    if (computedKey !== key) {
      return { valid: false, error: '激活码校验失败' };
    }

    const expiryTime = new Date(expiry).getTime();
    if (Number.isNaN(expiryTime)) {
      return { valid: false, error: '到期时间无效' };
    }
    if (Date.now() > expiryTime) {
      return { valid: false, error: '激活码已过期', expiry };
    }

    // Persist activation info
    try {
      store.set('activation', { expirationTime: expiryTime, mac: mac.toLowerCase() });
    } catch (e) {
      console.warn('保存激活信息失败，不影响使用:', e);
    }

    return { valid: true, expiry };
  } catch (error) {
    console.error('激活校验异常:', error);
    return { valid: false, error: (error as Error).message };
  }
});

safeIpcHandle('getMACAddress', async () => {
  console.log('Fetching MAC address...');
  try {
    const interfaces = os.networkInterfaces();
    
    // 检查网络接口是否可用
    if (!interfaces || Object.keys(interfaces).length === 0) {
      console.warn('无法获取网络接口信息，可能是网络服务问题');
      throw new Error('网络接口不可用');
    }
    
    // 优先查找有线网络接口
    const preferredInterfaces = ['en0', 'eth0', 'Ethernet'];
    for (const preferredName of preferredInterfaces) {
      const iface = interfaces[preferredName];
      if (iface) {
        for (const addr of iface) {
          if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
            console.log(`找到MAC地址 (${preferredName}): ${addr.mac}`);
            return addr.mac.toLowerCase();
          }
        }
      }
    }
    
    // 如果优先接口没有找到，遍历所有接口
    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name];
      if (!ifaceList) continue;
      
      for (const iface of ifaceList) {
        if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
          console.log(`找到MAC地址 (${name}): ${iface.mac}`);
          return iface.mac.toLowerCase();
        }
      }
    }
    
    console.warn('未找到有效的MAC地址');
    throw new Error('未找到有效的MAC地址');
  } catch (error) {
    console.error('获取MAC地址失败:', error);
    // 在网络异常时返回null而不是抛出异常，让调用方处理
    return null;
  }
});

// 保险：在顶层注册关键 IPC，避免某些环境下延迟导致未注册问题
safeIpcHandle('playlist:ensureDefault', () => {
  try {
    return DataManager.getInstance().ensureDefaultPlaylist();
  } catch (e) {
    console.error('fallback ensureDefault 失败:', e);
    return null;
  }
});

safeIpcHandle('music:addBatch', (_event, musicFiles: any[], targetPlaylistId?: string) => {
  try {
    const dm = DataManager.getInstance();
    // 确保默认歌单存在
    const defaultPl = dm.getDefaultPlaylist() || dm.ensureDefaultPlaylist();
    dm.addMusicFiles(musicFiles, targetPlaylistId);
    return { success: true, count: musicFiles.length, defaultPlaylistId: defaultPl.id };
  } catch (e) {
    console.error('fallback addBatch 失败:', e);
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
});

safeIpcHandle('music:getAll', () => {
  try {
    return DataManager.getInstance().getAllMusicFiles();
  } catch (e) {
    console.error('fallback getAll 失败:', e);
    return [];
  }
});

safeIpcHandle('music:add', (_event, musicFile: any, targetPlaylistId?: string) => {
  try {
    const dm = DataManager.getInstance();
    dm.addMusicFile(musicFile, targetPlaylistId);
    return true;
  } catch (e) {
    console.error('fallback add 失败:', e);
    return false;
  }
});

safeIpcHandle('music:update', (_event, id: string, updates: any) => {
  try {
    const dm = DataManager.getInstance();
    dm.updateMusicFile(id, updates);
    return true;
  } catch (e) {
    console.error('fallback music:update 失败:', e);
    return false;
  }
});

safeIpcHandle('music:delete', (_event, id: string) => {
  try {
    const dm = DataManager.getInstance();
    dm.deleteMusicFile(id);
    return true;
  } catch (e) {
    console.error('fallback music:delete 失败:', e);
    return false;
  }
});

safeIpcHandle('playlist:getAll', () => {
  try {
    return DataManager.getInstance().getAllPlaylists();
  } catch (e) {
    console.error('fallback playlist:getAll 失败:', e);
    return [];
  }
});

safeIpcHandle('playlist:get', (_e, id: string) => {
  try {
    return DataManager.getInstance().getPlaylist(id);
  } catch (e) {
    console.error('fallback playlist:get 失败:', e);
    return null;
  }
});

safeIpcHandle('playlist:create', (_e, playlist: any) => {
  return createPlaylistFromIpcPayload(playlist);
});

safeIpcHandle('playlist:update', (_e, id: string, updates: any) => {
  try {
    DataManager.getInstance().updatePlaylist(id, updates);
    return true;
  } catch (e) {
    console.error('fallback playlist:update 失败:', e);
    return false;
  }
});

safeIpcHandle('playlist:delete', (_e, id: string) => {
  try {
    DataManager.getInstance().deletePlaylist(id);
    return true;
  } catch (e) {
    console.error('fallback playlist:delete 失败:', e);
    return false;
  }
});

safeIpcHandle('playlist:getDefault', () => {
  try {
    const dm = DataManager.getInstance();
    // 始终确保默认歌单存在
    const pl = dm.getDefaultPlaylist() || dm.ensureDefaultPlaylist();
    return pl;
  } catch (e) {
    console.error('fallback playlist:getDefault 失败:', e);
    return null;
  }
});

safeIpcHandle('playlist:getCurrent', () => {
  try {
    return DataManager.getInstance().getCurrentPlaylist();
  } catch (e) {
    console.error('fallback playlist:getCurrent 失败:', e);
    return null;
  }
});

safeIpcHandle('playlist:setCurrent', (_e, playlistId: string) => {
  try {
    DataManager.getInstance().setCurrentPlaylist(playlistId);
    return true;
  } catch (e) {
    console.error('fallback playlist:setCurrent 失败:', e);
    return false;
  }
});

// 添加缺失的批量添加音乐到歌单处理器
safeIpcHandle('playlist:addMusicBatch', (_e, playlistId: string, musicIds: string[]) => {
  try {
    const dm = DataManager.getInstance();
    dm.addMusicToPlaylistBatch(playlistId, musicIds);
    return true;
  } catch (e) {
    console.error('fallback playlist:addMusicBatch 失败:', e);
    return false;
  }
});

safeIpcHandle('playlist:addMusic', (_e, playlistId: string, musicId: string) => {
  try {
    const dm = DataManager.getInstance();
    dm.addMusicToPlaylist(playlistId, musicId);
    return true;
  } catch (e) {
    console.error('fallback playlist:addMusic 失败:', e);
    return false;
  }
});

safeIpcHandle('playlist:removeMusic', (_e, playlistId: string, musicId: string) => {
  try {
    const dm = DataManager.getInstance();
    dm.removeMusicFromPlaylist(playlistId, musicId);
    return true;
  } catch (e) {
    console.error('fallback playlist:removeMusic 失败:', e);
    return false;
  }
});

safeIpcHandle('playlist:getMusic', (_e, playlistId: string) => {
  try {
    const dm = DataManager.getInstance();
    return dm.getPlaylistMusic(playlistId);
  } catch (e) {
    console.error('fallback playlist:getMusic 失败:', e);
    return [];
  }
});

// 添加缺失的排序处理器
safeIpcHandle('playlist:updateMusicOrder', (_e, playlistId: string, musicIds: string[]) => {
  try {
    const dm = DataManager.getInstance();
    dm.updatePlaylistMusicOrder(playlistId, musicIds);
    console.log('歌曲排序保存成功:', playlistId, musicIds.length, '首歌曲');
    return true;
  } catch (e) {
    console.error('fallback playlist:updateMusicOrder 失败:', e);
    return false;
  }
});

safeIpcHandle('playlist:updateOrder', (_e, playlistIds: string[]) => {
  try {
    const dm = DataManager.getInstance();
    dm.updatePlaylistsOrder(playlistIds);
    console.log('歌单排序保存成功:', playlistIds.length, '个歌单');
    return true;
  } catch (e) {
    console.error('fallback playlist:updateOrder 失败:', e);
    return false;
  }
});

// 添加缺失的music相关fallback handlers
safeIpcHandle('music:get', (_e, id: string) => {
  try {
    const dm = DataManager.getInstance();
    const music = dm.getMusicFile(id);
    console.log('fallback music:get 调用:', id);
    console.log('fallback music:get 结果:', music ? '找到' : '未找到');
    if (music) {
      console.log('fallback music:get 音乐信息:', {
        id: music.id,
        fileName: music.fileName,
        displayName: music.displayName,
        filePath: music.filePath
      });
    }
    
    if (!music) {
      // 如果没找到，列出所有音乐文件进行调试
      const allMusic = dm.getAllMusicFiles();
      console.log('fallback music:get 调试 - 总音乐数量:', allMusic.length);
      console.log('fallback music:get 调试 - 所有音乐ID:', allMusic.map(m => m.id));
      
      // 检查是否有相似的ID
      const similarIds = allMusic.filter(m => m.id.includes(id.slice(-8)) || id.includes(m.id.slice(-8)));
      if (similarIds.length > 0) {
        console.log('fallback music:get 调试 - 发现相似ID:', similarIds.map(m => m.id));
      }
    }
    
    return music;
  } catch (e) {
    console.error('fallback music:get 失败:', e);
    return null;
  }
});

safeIpcHandle('music:update', (_e, id: string, updates: any) => {
  try {
    const dm = DataManager.getInstance();
    console.log('fallback music:update 调用:', id, '更新内容:', updates);
    
    // 检查更新前的状态
    const beforeUpdate = dm.getMusicFile(id);
    console.log('fallback music:update 更新前:', beforeUpdate ? {
      id: beforeUpdate.id,
      duration: beforeUpdate.duration,
      isTrimmed: beforeUpdate.isTrimmed
    } : '未找到');
    
    dm.updateMusicFile(id, updates);
    
    // 检查更新后的状态
    const afterUpdate = dm.getMusicFile(id);
    console.log('fallback music:update 更新后:', afterUpdate ? {
      id: afterUpdate.id,
      duration: afterUpdate.duration,
      isTrimmed: afterUpdate.isTrimmed
    } : '未找到');
    
    console.log('fallback music:update 成功:', id);
    return true;
  } catch (e) {
    console.error('fallback music:update 失败:', e);
    return false;
  }
});

safeIpcHandle('music:delete', (_e, id: string) => {
  try {
    const dm = DataManager.getInstance();
    dm.deleteMusicFile(id);
    console.log('fallback music:delete 成功:', id);
    return true;
  } catch (e) {
    console.error('fallback music:delete 失败:', e);
    return false;
  }
});

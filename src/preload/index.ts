import { contextBridge, ipcRenderer } from 'electron';

// 音频相关API
const audioAPI = {
  // FFmpeg相关
  ffmpeg: {
    check: () => ipcRenderer.invoke('ffmpeg:check'),
    convert: (options: any) => ipcRenderer.invoke('ffmpeg:convert', options),
    cancel: (conversionId: string) => ipcRenderer.invoke('ffmpeg:cancel', conversionId),
    getInfo: (filePath: string) => ipcRenderer.invoke('ffmpeg:getInfo', filePath),
    onProgress: (callback: (progress: any) => void) => {
      ipcRenderer.on('ffmpeg:progress', (event, progress) => callback(progress));
    }
  },
  
  // 音乐解密相关
  music: {
    decrypt: (options: any) => ipcRenderer.invoke('music:decrypt', options),
    canDecrypt: (format: string) => ipcRenderer.invoke('music:canDecrypt', format)
  },
  
  // 文件系统操作
  fs: {
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, data: any) => ipcRenderer.invoke('fs:writeFile', filePath, data),
    unlink: (filePath: string) => ipcRenderer.invoke('fs:unlink', filePath),
    mkdir: (dirPath: string) => ipcRenderer.invoke('fs:mkdir', dirPath),
    readdir: (dirPath: string) => ipcRenderer.invoke('fs:readdir', dirPath),
    exists: (path: string) => ipcRenderer.invoke('fs:exists', path),
    stat: (path: string) => ipcRenderer.invoke('fs:stat', path),
    scanAudioFiles: (folderPath: string) => ipcRenderer.invoke('fs:scanAudioFiles', folderPath)
  },
  
  // 应用相关
  app: {
    getTempPath: () => ipcRenderer.invoke('app:getTempPath'),
    getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getDesktopPath: () => ipcRenderer.invoke('app:getPath', 'desktop')
  },
  
  // 系统对话框
  dialog: {
    openFile: (options?: any) => ipcRenderer.invoke('dialog:openFile', options),
    openFolder: (options?: any) => ipcRenderer.invoke('dialog:openFolder', options),
    saveFile: (options?: any) => ipcRenderer.invoke('dialog:saveFile', options),
    showMessage: (options: any) => ipcRenderer.invoke('dialog:showMessage', options)
  },
  
  // 系统信息
  system: {
    getPlatform: () => process.platform,
    getArch: () => process.arch,
    getNodeVersion: () => process.versions.node,
    getElectronVersion: () => process.versions.electron,
    openFolder: () => ipcRenderer.invoke('system:openFolder'),
    openFile: () => ipcRenderer.invoke('system:openFile'),
    getAudioDevices: () => ipcRenderer.invoke('system:getAudioDevices')
  }
};

// 录音相关API
const recordingAPI = {
  // 获取音频设备
  getAudioDevices: () => ipcRenderer.invoke('recording:getAudioDevices'),
  
  // 开始录音
  startRecording: (options: any) => ipcRenderer.invoke('recording:start', options),
  
  // 停止录音
  stopRecording: () => ipcRenderer.invoke('recording:stop'),
  
  // 暂停/恢复录音
  pauseRecording: () => ipcRenderer.invoke('recording:pause'),
  resumeRecording: () => ipcRenderer.invoke('recording:resume'),
  
  // 录音事件监听
  onRecordingData: (callback: (data: any) => void) => {
    ipcRenderer.on('recording:data', (event, data) => callback(data));
  },
  
  onRecordingError: (callback: (error: any) => void) => {
    ipcRenderer.on('recording:error', (event, error) => callback(error));
  }
};

// 快捷键API
const shortcutAPI = {
  // 注册快捷键
  register: (shortcut: string, callback: () => void) => {
    ipcRenderer.on(`shortcut:${shortcut}`, callback);
    return ipcRenderer.invoke('shortcut:register', shortcut);
  },
  
  // 注销快捷键
  unregister: (shortcut: string) => {
    ipcRenderer.removeAllListeners(`shortcut:${shortcut}`);
    return ipcRenderer.invoke('shortcut:unregister', shortcut);
  },
  
  // 注销所有快捷键
  unregisterAll: () => ipcRenderer.invoke('shortcut:unregisterAll')
};

// 数据存储API
const storageAPI = {
  // 获取数据
  get: (key: string) => ipcRenderer.invoke('storage:get', key),
  
  // 设置数据
  set: (key: string, value: any) => ipcRenderer.invoke('storage:set', key, value),
  
  // 删除数据
  delete: (key: string) => ipcRenderer.invoke('storage:delete', key),
  
  // 清空所有数据
  clear: () => ipcRenderer.invoke('storage:clear'),
  
  // 获取所有键
  keys: () => ipcRenderer.invoke('storage:keys')
};

// 音乐数据管理API
const musicAPI = {
  // 音乐文件操作
  getAll: () => ipcRenderer.invoke('music:getAll'),
  get: (id: string) => ipcRenderer.invoke('music:get', id),
  add: (musicFile: any, targetPlaylistId?: string) => ipcRenderer.invoke('music:add', musicFile, targetPlaylistId),
  addBatch: (musicFiles: any[], targetPlaylistId?: string) => ipcRenderer.invoke('music:addBatch', musicFiles, targetPlaylistId),
  update: (id: string, updates: any) => ipcRenderer.invoke('music:update', id, updates),
  delete: (id: string) => ipcRenderer.invoke('music:delete', id),
  clearAll: () => ipcRenderer.invoke('music:clearAll'),
  play: (filePath: string) => ipcRenderer.invoke('music:play', filePath),
  
  // 🔧 Windows修复：添加文件导入功能
  selectFiles: () => ipcRenderer.invoke('music:selectFiles'),
  selectFolder: () => ipcRenderer.invoke('music:selectFolder')
};

// 播放列表API
const playlistsAPI = {
  getAll: () => ipcRenderer.invoke('playlist:getAll'),
  get: (id: string) => ipcRenderer.invoke('playlist:get', id),
  create: (playlist: any) => ipcRenderer.invoke('playlist:create', playlist),
  update: (id: string, updates: any) => ipcRenderer.invoke('playlist:update', id, updates),
  delete: (id: string) => ipcRenderer.invoke('playlist:delete', id),
  
  // 播放列表音乐关联操作
  addMusic: (playlistId: string, musicId: string) => ipcRenderer.invoke('playlist:addMusic', playlistId, musicId),
  removeMusic: (playlistId: string, musicId: string) => ipcRenderer.invoke('playlist:removeMusic', playlistId, musicId),
  getMusic: (playlistId: string) => ipcRenderer.invoke('playlist:getMusic', playlistId),
  addMusicBatch: (playlistId: string, musicIds: string[]) => ipcRenderer.invoke('playlist:addMusicBatch', playlistId, musicIds),
  
  // 排序操作
  updateOrder: (playlistIds: string[]) => ipcRenderer.invoke('playlist:updateOrder', playlistIds),
  updateMusicOrder: (playlistId: string, musicIds: string[]) => ipcRenderer.invoke('playlist:updateMusicOrder', playlistId, musicIds),
  
  // 默认播放列表
  getDefault: () => ipcRenderer.invoke('playlist:getDefault'),
  ensureDefault: () => ipcRenderer.invoke('playlist:ensureDefault'),
  
  // 当前播放列表
  getCurrent: () => ipcRenderer.invoke('playlist:getCurrent'),
  setCurrent: (playlistId: string) => ipcRenderer.invoke('playlist:setCurrent', playlistId)
};

// 人声消除API
const vocalRemoverAPI = {
  // 处理单个文件
  process: (options: any) => ipcRenderer.invoke('vocal-remover:process', options),
  
  // 批量处理
  processBatch: (files: string[], outputDir: string, options: any) => 
    ipcRenderer.invoke('vocal-remover:processBatch', files, outputDir, options),
  
  // 取消处理
  cancel: () => ipcRenderer.invoke('vocal-remover:cancel'),
  
  // 获取状态
  getStatus: () => ipcRenderer.invoke('vocal-remover:getStatus'),
  
  // 检查FFmpeg
  checkFFmpeg: () => ipcRenderer.invoke('vocal-remover:checkFFmpeg'),
  
  // 获取算法信息
  getAlgorithms: () => ipcRenderer.invoke('vocal-remover:getAlgorithms'),
  
  // 文件选择
  selectInputFile: () => ipcRenderer.invoke('vocal-remover:selectInputFile'),
  selectOutputDir: () => ipcRenderer.invoke('vocal-remover:selectOutputDir'),
  
  // 路径验证
  validatePath: (filePath: string, type: 'input' | 'output') => ipcRenderer.invoke('vocal-remover:validatePath', filePath, type),
  
  // 获取默认路径
  getDefaultPaths: () => ipcRenderer.invoke('vocal-remover:getDefaultPaths'),
  
  // 进度监听
  onProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('vocal-remover:progress', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('vocal-remover:progress');
  }
};

// 控台录音API
const consoleRecordingAPI = {
  // 获取音频设备列表
  getDevices: () => ipcRenderer.invoke('console-recording:getDevices'),
  
  // 检测控台话筒连接
  detectConsole: () => ipcRenderer.invoke('console-recording:detectConsole'),
  
  // 手动检测控台话筒
  manualDetect: () => ipcRenderer.invoke('console-recording:manualDetect'),
  
  // 开始录音
  start: (options: any) => ipcRenderer.invoke('console-recording:start', options),
  
  // 停止录音
  stop: () => ipcRenderer.invoke('console-recording:stop'),
  
  // 暂停录音
  pause: () => ipcRenderer.invoke('console-recording:pause'),
  
  // 恢复录音
  resume: () => ipcRenderer.invoke('console-recording:resume'),
  
  // 获取录音状态
  getStatus: () => ipcRenderer.invoke('console-recording:getStatus'),
  
  // 监听控台话筒检测事件
  onConsoleDetected: (callback: () => void) => {
    ipcRenderer.on('console-recording:console-detected', callback);
    return () => ipcRenderer.removeAllListeners('console-recording:console-detected');
  },
  
  // 监听录音开始事件
  onRecordingStarted: (callback: (path: string) => void) => {
    ipcRenderer.on('console-recording:started', (event, path) => callback(path));
    return () => ipcRenderer.removeAllListeners('console-recording:started');
  },
  
  // 监听录音停止事件
  onRecordingStopped: (callback: () => void) => {
    ipcRenderer.on('console-recording:stopped', callback);
    return () => ipcRenderer.removeAllListeners('console-recording:stopped');
  },

  // 监听录音错误事件
  onRecordingError: (callback: (error: any) => void) => {
    ipcRenderer.on('console-recording:error', (event, error) => callback(error));
    return () => ipcRenderer.removeAllListeners('console-recording:error');
  }
};

// 手卡API
const handCardAPI = {
  // 获取手卡状态
  getStatus: () => ipcRenderer.invoke('handcard:getStatus'),
  
  // 扫描设备
  scan: () => ipcRenderer.invoke('handcard:scan'),
  
  // 连接设备
  connect: (deviceId: string) => ipcRenderer.invoke('handcard:connect', deviceId),
  
  // 断开设备
  disconnect: () => ipcRenderer.invoke('handcard:disconnect'),
  
  // 监听状态变化
  onStatusChange: (callback: (status: any) => void) => {
    ipcRenderer.on('handcard:status', (event, status) => callback(status));
    return () => ipcRenderer.removeAllListeners('handcard:status');
  },
  
  // 监听手卡命令
  onCommand: (callback: (command: any) => void) => {
    ipcRenderer.on('handcard:command', (event, command) => callback(command));
    return () => ipcRenderer.removeAllListeners('handcard:command');
  }
};

// 音频剪辑API
const audioEditorAPI = {
  // 获取音频信息
  getInfo: (filePath: string) => ipcRenderer.invoke('audio-editor:getInfo', filePath),
  
  // 生成波形数据
  getWaveform: (filePath: string) => ipcRenderer.invoke('audio-editor:getWaveform', filePath),
  
  // 剪辑音频
  trim: (options: any) => ipcRenderer.invoke('audio-editor:trim', options),
  
  // 合并音频
  merge: (files: string[], outputFile: string) => ipcRenderer.invoke('audio-editor:merge', files, outputFile),
  
  // 调整音量
  adjustVolume: (inputFile: string, outputFile: string, volume: number) => 
    ipcRenderer.invoke('audio-editor:adjustVolume', inputFile, outputFile, volume),
  
  // 取消操作
  cancel: () => ipcRenderer.invoke('audio-editor:cancel'),
  
  // 选择文件
  selectFile: () => ipcRenderer.invoke('audio-editor:selectFile'),
  
  // 选择保存位置
  selectSaveLocation: (defaultName: string) => ipcRenderer.invoke('audio-editor:selectSaveLocation', defaultName),
  
  // 监听进度
  onProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('audio-editor:progress', (event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('audio-editor:progress');
  }
};

// 专有格式解密API已禁用
// const proprietaryAPI = {
//   // 检测支持情况
//   detectSupport: () => Promise.resolve({ exists: false, platform: process.platform }),
//   // 选择专有加密文件
//   selectFiles: () => Promise.resolve([]),
//   // 执行解密
//   decrypt: (files: string[], outputDir: string) => Promise.resolve({ success: false, message: '解密功能已禁用' })
// };

// 窗口控制API
const windowAPI = {
  // 最小化
  minimize: () => ipcRenderer.invoke('window:minimize'),
  
  // 最大化/恢复
  maximize: () => ipcRenderer.invoke('window:maximize'),
  
  // 关闭
  close: () => ipcRenderer.invoke('window:close'),
  
  // 全屏
  setFullScreen: (flag: boolean) => ipcRenderer.invoke('window:setFullScreen', flag),
  
  // 置顶
  setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
  
  // 获取窗口状态
  getState: () => ipcRenderer.invoke('window:getState')
};

// 暴露API到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 音频相关API
  ffmpeg: audioAPI.ffmpeg,
  fs: audioAPI.fs,
  app: audioAPI.app,
  dialog: audioAPI.dialog,
  system: audioAPI.system,
  
  // Shell API - 用于打开外部链接（通过 IPC）
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },
  
  // IPC 通信
  ipcRenderer: {
    on: (channel: string, func: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send(channel, ...args);
    },
    invoke: (channel: string, ...args: any[]) => {
      return ipcRenderer.invoke(channel, ...args);
    }
  },
  
  // 数据管理API（合并解密功能和音乐管理）
  music: {
    // 解密功能
    decrypt: audioAPI.music.decrypt,
    canDecrypt: audioAPI.music.canDecrypt,
    // 音乐管理
    ...musicAPI,
    playlists: playlistsAPI,
  },
  
  // 其他API
  recording: recordingAPI,
  shortcut: shortcutAPI,
  storage: {
    get: (key: string) => ipcRenderer.invoke('storage:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('storage:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('storage:delete', key),
    clear: () => ipcRenderer.invoke('storage:clear'),
    keys: () => ipcRenderer.invoke('storage:keys'),
  },
  vocalRemover: vocalRemoverAPI,
  consoleRecording: consoleRecordingAPI,
  handCard: handCardAPI,
  audioEditor: audioEditorAPI,
  // proprietary: proprietaryAPI, // 解密功能已禁用
  window: windowAPI,
  // 调试工具
  debug: {
    windowsDiagnosis: () => ipcRenderer.invoke('debug:windows-diagnosis'),
  },
  // 激活相关
  getMACAddress: () => ipcRenderer.invoke('getMACAddress'),
  validateActivationKey: (code: string, mac: string) => ipcRenderer.invoke('validateActivationKey', code, mac),
});

// TypeScript类型定义
export {};

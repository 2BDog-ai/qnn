import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const readdir = promisify(fs.readdir);
const access = promisify(fs.access);

interface VocalRemovalOptions {
  inputPath: string;
  outputPath: string;
  outputFileName?: string;  // 新增：输出文件名
  algorithm?: 'karaoke' | 'bandpass' | 'phase' | 'highpass' | 'spectral' | 'wiener' | 'bss' | 'hpss' | 'multistage' | 'spectral_gating';
  quality?: 'low' | 'medium' | 'high' | 'ultra';
  preserveBass?: boolean;
  preserveHighs?: boolean;
  spectralThreshold?: number;
  wienerNoiseLevel?: number;
  bssIterations?: number;
  hpssKernelSize?: number;
  multistageLevels?: number;
  spectralGatingSensitivity?: number;
}

interface ProcessingResult {
  success: boolean;
  outputPath?: string;
  duration?: number;
  error?: string;
  details?: string;
}

interface SystemInfo {
  ffmpegAvailable: boolean;
  ffmpegPath?: string;
  version?: string;
  supportedFormats: string[];
  tempDir: string;
  platform: string;
}

class VocalRemoverManager {
  private isProcessing = false;
  private currentProcess: any = null;
  private mainWindow: BrowserWindow | null = null;
  private systemInfo: SystemInfo | null = null;

  constructor() {
    this.setupIpcHandlers();
    this.initializeSystem();
  }

  /**
   * 初始化系统信息
   */
  private async initializeSystem() {
    this.systemInfo = await this.getSystemInfo();
    console.log('系统信息初始化完成:', this.systemInfo);
  }

  /**
   * 设置主窗口引用
   */
  public setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * 设置IPC处理器
   */
  private setupIpcHandlers() {
    // 核心处理功能
    ipcMain.handle('vocal-remover:process', async (event, options: VocalRemovalOptions) => {
      console.log('收到人声消除请求:', options);
      return await this.processVocalRemoval(options);
    });

    // 系统检查和初始化
    ipcMain.handle('vocal-remover:getSystemInfo', async () => {
      if (!this.systemInfo) {
        this.systemInfo = await this.getSystemInfo();
      }
      return this.systemInfo;
    });

    // 文件选择器
    ipcMain.handle('vocal-remover:selectInputFile', async () => {
      return await this.selectInputFile();
    });

    ipcMain.handle('vocal-remover:selectOutputDir', async () => {
      return await this.selectOutputDirectory();
    });

    // 路径验证
    ipcMain.handle('vocal-remover:validatePath', async (event, filePath: string, type: 'input' | 'output') => {
      return await this.validatePath(filePath, type);
    });

    // 取消处理
    ipcMain.handle('vocal-remover:cancel', async () => {
      return await this.cancelProcessing();
    });

    // 获取处理状态
    ipcMain.handle('vocal-remover:getStatus', () => {
      return { 
        isProcessing: this.isProcessing,
        systemReady: this.systemInfo?.ffmpegAvailable || false
      };
    });

    // 批量处理
    ipcMain.handle('vocal-remover:processBatch', async (event, files: string[], outputDir: string, options: Partial<VocalRemovalOptions>) => {
      return await this.processBatch(files, outputDir, options);
    });

    // 获取算法信息
    ipcMain.handle('vocal-remover:getAlgorithms', () => {
      return this.getAvailableAlgorithms();
    });

    // 测试FFmpeg
    ipcMain.handle('vocal-remover:checkFFmpeg', async () => {
      return await this.testFFmpegInstallation();
    });

    // 获取默认路径
    ipcMain.handle('vocal-remover:getDefaultPaths', () => {
      return this.getDefaultPaths();
    });
  }

  /**
   * 获取系统信息
   */
  private async getSystemInfo(): Promise<SystemInfo> {
    const ffmpegInfo = await this.detectFFmpeg();
    const tempDir = os.tmpdir();
    const platform = os.platform();
    
    return {
      ffmpegAvailable: ffmpegInfo.available,
      ffmpegPath: ffmpegInfo.path,
      version: ffmpegInfo.version,
      supportedFormats: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'],
      tempDir,
      platform
    };
  }

  /**
   * 智能检测FFmpeg
   */
  private async detectFFmpeg(): Promise<{ available: boolean; path?: string; version?: string }> {
    const possiblePaths = this.getFFmpegPossiblePaths();
    
    for (const ffmpegPath of possiblePaths) {
      try {
        console.log(`尝试FFmpeg路径: ${ffmpegPath}`);
        const result = await this.testFFmpegPath(ffmpegPath);
        if (result.available) {
          console.log(`FFmpeg找到: ${ffmpegPath}, 版本: ${result.version}`);
          return { available: true, path: ffmpegPath, version: result.version };
        }
      } catch (error) {
        console.log(`FFmpeg路径 ${ffmpegPath} 不可用:`, error);
      }
    }
    
    console.error('未找到可用的FFmpeg安装');
    return { available: false };
  }

  /**
   * 获取FFmpeg可能的路径
   */
  private getFFmpegPossiblePaths(): string[] {
    const platform = os.platform();
    let paths = ['ffmpeg']; // 先尝试PATH中的ffmpeg
    
    if (platform === 'win32') {
      // Windows: 优先使用系统安装的 FFmpeg (通过 winget 安装)
      paths = paths.concat([
        'ffmpeg.exe',
        path.join(process.cwd(), 'ffmpeg.exe'),
        path.join(process.cwd(), 'bin', 'ffmpeg.exe'),
        path.join(app.getPath('userData'), 'bin', 'ffmpeg.exe'),
        'C:\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\Program Files\\FFmpeg\\bin\\ffmpeg.exe',
        'C:\\Program Files (x86)\\FFmpeg\\bin\\ffmpeg.exe'
      ]);
      
      // 只有在系统 FFmpeg 不可用时才使用打包版本
      if (app.isPackaged) {
        const ffmpegName = 'ffmpeg.exe';
        const appPath = path.dirname(process.resourcesPath);  // Contents目录
        paths.push(path.join(appPath, 'ffmpeg', ffmpegName));
      }
    } else if (platform === 'darwin') {
      // macOS: 优先使用系统安装的 FFmpeg
      paths = paths.concat([
        '/usr/local/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg',
        '/usr/bin/ffmpeg',
        path.join(process.cwd(), 'ffmpeg'),
        path.join(app.getPath('userData'), 'bin', 'ffmpeg')
      ]);
      
      // 打包版本的 FFmpeg 路径
      if (app.isPackaged) {
        const ffmpegName = 'ffmpeg';
        // 修复：FFmpeg 在 Resources 目录下，不是 Contents 目录
        // process.resourcesPath 已经指向 Contents/Resources
        paths.push(path.join(process.resourcesPath, 'ffmpeg', ffmpegName));
        // 备用路径
        paths.push(path.join(process.resourcesPath, '..', 'Resources', 'ffmpeg', ffmpegName));
      }
    } else {
      // Linux: 优先使用系统安装的 FFmpeg
      paths = paths.concat([
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/opt/ffmpeg/bin/ffmpeg',
        path.join(process.cwd(), 'ffmpeg'),
        path.join(app.getPath('userData'), 'bin', 'ffmpeg')
      ]);
      
      // 只有在系统 FFmpeg 不可用时才使用打包版本
      if (app.isPackaged) {
        const ffmpegName = 'ffmpeg';
        const appPath = path.dirname(process.resourcesPath);  // Contents目录
        paths.push(path.join(appPath, 'ffmpeg', ffmpegName));
      }
    }
    
    return paths;
  }

  /**
   * 测试特定FFmpeg路径
   */
  private async testFFmpegPath(ffmpegPath: string): Promise<{ available: boolean; version?: string }> {
    return new Promise((resolve) => {
      const process = spawn(ffmpegPath, ['-version'], { 
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000
      });
      
      let output = '';
      
      process.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      process.on('error', (error) => {
        console.log(`FFmpeg路径测试失败 ${ffmpegPath}:`, error.message);
        resolve({ available: false });
      });
      
      process.on('close', (code) => {
        if (code === 0 && output.includes('ffmpeg version')) {
          // 提取版本信息
          const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
          const version = versionMatch ? versionMatch[1] : 'unknown';
          resolve({ available: true, version });
        } else {
          resolve({ available: false });
        }
      });
      
      // 设置超时
      setTimeout(() => {
        if (!process.killed) {
          process.kill();
          resolve({ available: false });
        }
      }, 5000);
    });
  }

  /**
   * 测试FFmpeg滤镜可用性
   */
  private async testFilterAvailability(filterName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpegPath = this.systemInfo?.ffmpegPath || 'ffmpeg';
      const process = spawn(ffmpegPath, ['-filters'], { stdio: ['ignore', 'pipe', 'pipe'] });
      
      let output = '';
      
      process.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(output.includes(filterName));
        } else {
          resolve(false);
        }
      });
      
      process.on('error', () => {
        resolve(false);
      });
      
      setTimeout(() => {
        if (!process.killed) {
          process.kill();
          resolve(false);
        }
      }, 3000);
    });
  }

  /**
   * 测试FFmpeg完整功能
   */
  private async testFFmpegInstallation(): Promise<{ available: boolean; details: string; suggestions?: string[] }> {
    if (!this.systemInfo?.ffmpegAvailable) {
      return {
        available: false,
        details: 'FFmpeg未安装或不在PATH中',
        suggestions: this.getFFmpegInstallationSuggestions()
      };
    }

    try {
      // 测试基本功能
      const testResult = await this.testFFmpegBasicFunction();
      if (!testResult.success) {
        return {
          available: false,
          details: `FFmpeg功能测试失败: ${testResult.error}`,
          suggestions: ['检查FFmpeg是否完整安装', '确认FFmpeg支持音频编解码器']
        };
      }

      return {
        available: true,
        details: `FFmpeg可用 (版本: ${this.systemInfo.version})`
      };
    } catch (error) {
      return {
        available: false,
        details: `FFmpeg测试异常: ${error}`,
        suggestions: ['重新安装FFmpeg', '检查系统权限']
      };
    }
  }

  /**
   * 测试FFmpeg基本功能
   */
  private async testFFmpegBasicFunction(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const ffmpegPath = this.systemInfo?.ffmpegPath || 'ffmpeg';
      const process = spawn(ffmpegPath, ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-f', 'null', '-'], {
        stdio: ['ignore', 'ignore', 'pipe']
      });

      let errorOutput = '';
      
      process.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      process.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: errorOutput });
        }
      });

      setTimeout(() => {
        if (!process.killed) {
          process.kill();
          resolve({ success: false, error: '测试超时' });
        }
      }, 10000);
    });
  }

  /**
   * 获取FFmpeg安装建议
   */
  private getFFmpegInstallationSuggestions(): string[] {
    const platform = os.platform();
    
    switch (platform) {
      case 'win32':
        return [
          '从 https://ffmpeg.org/download.html 下载FFmpeg',
          '解压到 C:\\ffmpeg 目录',
          '将 C:\\ffmpeg\\bin 添加到系统PATH环境变量',
          '或者将ffmpeg.exe放在应用程序目录下'
        ];
      case 'darwin':
        return [
          '使用Homebrew安装: brew install ffmpeg',
          '或从 https://ffmpeg.org/download.html 下载',
          '确保FFmpeg在/usr/local/bin目录中'
        ];
      default:
        return [
          '使用包管理器安装: sudo apt install ffmpeg (Ubuntu)',
          '或使用: sudo yum install ffmpeg (CentOS)',
          '或从源码编译安装'
        ];
    }
  }

  /**
   * 文件选择器
   */
  private async selectInputFile(): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      if (!this.mainWindow) {
        return { success: false, error: '主窗口未初始化' };
      }

      const result = await dialog.showOpenDialog(this.mainWindow, {
        title: '选择音频文件',
        filters: [
          { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile'],
        defaultPath: this.getDefaultInputPath()
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, error: '用户取消选择' };
      }

      const selectedPath = result.filePaths[0];
      
      // 验证文件
      const validation = await this.validatePath(selectedPath, 'input');
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      return { success: true, path: selectedPath };
    } catch (error) {
      console.error('文件选择失败:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '文件选择失败' 
      };
    }
  }

  /**
   * 输出目录选择器
   */
  private async selectOutputDirectory(): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      if (!this.mainWindow) {
        return { success: false, error: '主窗口未初始化' };
      }

      const result = await dialog.showOpenDialog(this.mainWindow, {
        title: '选择输出目录',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: this.getDefaultOutputPath()
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, error: '用户取消选择' };
      }

      const selectedPath = result.filePaths[0];
      
      // 验证目录权限
      const validation = await this.validatePath(selectedPath, 'output');
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      return { success: true, path: selectedPath };
    } catch (error) {
      console.error('目录选择失败:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '目录选择失败' 
      };
    }
  }

  /**
   * 路径验证
   */
  private async validatePath(filePath: string, type: 'input' | 'output'): Promise<{ valid: boolean; error?: string; details?: string }> {
    try {
      // 检查路径是否存在
      try {
        await access(filePath, fs.constants.F_OK);
      } catch {
        if (type === 'input') {
          return { valid: false, error: '输入文件不存在', details: `路径: ${filePath}` };
        }
        // 输出路径不存在时尝试创建
        try {
          await mkdir(filePath, { recursive: true });
        } catch (mkdirError) {
          return { 
            valid: false, 
            error: '无法创建输出目录', 
            details: `路径: ${filePath}, 错误: ${mkdirError}` 
          };
        }
      }

      const stats = await stat(filePath);

      if (type === 'input') {
        // 验证输入文件
        if (!stats.isFile()) {
          return { valid: false, error: '输入路径不是文件', details: filePath };
        }

        // 检查文件大小
        if (stats.size === 0) {
          return { valid: false, error: '输入文件为空', details: filePath };
        }

        // 检查文件扩展名
        const ext = path.extname(filePath).toLowerCase();
        const supportedExts = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma'];
        if (!supportedExts.includes(ext)) {
          return { 
            valid: false, 
            error: '不支持的文件格式', 
            details: `文件: ${filePath}, 支持的格式: ${supportedExts.join(', ')}` 
          };
        }

        // 检查读取权限
        try {
          await access(filePath, fs.constants.R_OK);
        } catch {
          return { valid: false, error: '没有文件读取权限', details: filePath };
        }
      } else {
        // 验证输出目录
        if (!stats.isDirectory()) {
          return { valid: false, error: '输出路径不是目录', details: filePath };
        }

        // 检查写入权限
        try {
          await access(filePath, fs.constants.W_OK);
        } catch {
          return { valid: false, error: '没有目录写入权限', details: filePath };
        }
      }

      return { valid: true };
    } catch (error) {
      console.error('路径验证失败:', error);
      return { 
        valid: false, 
        error: '路径验证失败', 
        details: error instanceof Error ? error.message : '未知错误' 
      };
    }
  }

  /**
   * 获取默认路径
   */
  private getDefaultPaths() {
    return {
      input: app.getPath('music'),
      output: path.join(app.getPath('documents'), '人声消除输出'),
      temp: os.tmpdir()
    };
  }

  /**
   * 获取默认输入路径
   */
  private getDefaultInputPath(): string {
    try {
      return app.getPath('music');
    } catch {
      return app.getPath('home');
    }
  }

  /**
   * 获取默认输出路径
   */
  private getDefaultOutputPath(): string {
    try {
      const documentsPath = app.getPath('documents');
      const outputPath = path.join(documentsPath, '人声消除输出');
      // 确保目录存在
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }
      return outputPath;
    } catch {
      return app.getPath('home');
    }
  }

  /**
   * 处理人声消除 - 完全重写，简化逻辑
   */
  private async processVocalRemoval(options: VocalRemovalOptions): Promise<ProcessingResult> {
    console.log('=== 人声消除处理开始 ===');
    console.log('接收到的参数:', JSON.stringify(options, null, 2));
    
    try {
      // 1. 检查是否正在处理
      if (this.isProcessing) {
        return { success: false, error: '已有处理任务在进行中' };
      }

      // 2. 检查FFmpeg
      if (!this.systemInfo?.ffmpegAvailable) {
        return { 
          success: false, 
          error: 'FFmpeg不可用',
          details: 'FFmpeg未安装或配置不正确'
        };
      }

      // 3. 验证输入文件
      const inputPath = options.inputPath;
      if (!fs.existsSync(inputPath)) {
        return { 
          success: false, 
          error: '输入文件不存在', 
          details: inputPath 
        };
      }
      console.log('✓ 输入文件存在:', inputPath);

      // 4. 构建输出文件完整路径 - 关键修复
      const outputDir = options.outputPath;  // 这是目录
      const outputFileName = options.outputFileName || 'output.mp3';  // 这是文件名
      const outputFilePath = path.join(outputDir, outputFileName);  // 拼接完整路径
      
      console.log('输出目录:', outputDir);
      console.log('输出文件名:', outputFileName);
      console.log('输出完整路径:', outputFilePath);

      // 5. 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        console.log('创建输出目录:', outputDir);
        fs.mkdirSync(outputDir, { recursive: true });
      }
      console.log('✓ 输出目录已准备');

      // 6. 开始处理
      this.isProcessing = true;
      const startTime = Date.now();
      this.sendProgressUpdate('processing', 0, '开始处理...');

      // 7. 构建滤镜
      const filter = this.buildCompatibleAudioFilter(options);
      console.log('使用滤镜:', filter);
      
      // 8. 执行FFmpeg
      console.log('开始执行FFmpeg...');
      const success = await this.executeFFmpeg(
        inputPath, 
        outputFilePath,  // 传递完整的文件路径
        filter, 
        options
      );
      
      const duration = Date.now() - startTime;
      this.isProcessing = false;

      // 9. 检查结果
      if (success) {
        if (fs.existsSync(outputFilePath)) {
          const stats = fs.statSync(outputFilePath);
          if (stats.size === 0) {
            return { 
              success: false, 
              error: '输出文件为空', 
              details: '处理完成但文件大小为0' 
            };
          }

          console.log('✓ 处理成功，文件大小:', stats.size);
          this.sendProgressUpdate('completed', 100, '处理完成');
          return { 
            success: true, 
            outputPath: outputFilePath,
            duration: duration / 1000,
            details: `处理完成，文件大小: ${this.formatFileSize(stats.size)}`
          };
        } else {
          return { 
            success: false, 
            error: '输出文件未生成',
            details: `期望路径: ${outputFilePath}`
          };
        }
      } else {
        return { 
          success: false, 
          error: 'FFmpeg处理失败',
          details: '请检查输入文件格式'
        };
      }
    } catch (error) {
      this.isProcessing = false;
      console.error('处理异常:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '未知错误',
        details: '处理过程中发生异常'
      };
    }
  }

  /**
   * 构建兼容的音频滤镜 - 修复FFmpeg 8.0兼容性问题
   */
  private buildCompatibleAudioFilter(options: VocalRemovalOptions): string {
    try {
      const algorithm = options.algorithm || 'karaoke';
      const quality = options.quality || 'high';
      
      let filter = '';
      
      switch (algorithm) {
        case 'spectral':
          filter = this.buildCompatibleSpectralFilter(options);
          break;
        case 'wiener':
          filter = this.buildCompatibleWienerFilter(options);
          break;
        case 'bss':
          filter = this.buildCompatibleBSSFilter(options);
          break;
        case 'hpss':
          filter = this.buildCompatibleHPSSFilter(options);
          break;
        case 'multistage':
          filter = this.buildCompatibleMultistageFilter(options);
          break;
        case 'spectral_gating':
          filter = this.buildCompatibleSpectralGatingFilter(options);
          break;
        case 'phase':
          filter = this.buildPhaseFilter(options);
          break;
        case 'bandpass':
          filter = this.buildBandpassFilter(options);
          break;
        case 'highpass':
          filter = this.buildHighpassFilter(options);
          break;
        case 'karaoke':
        default:
          filter = this.buildKaraokeFilter(options);
          break;
      }
      
      // 添加低音和高音保护
      if (options.preserveBass) {
        filter = `${filter},equalizer=f=60:t=q:w=0.5:g=3`;
      }
      if (options.preserveHighs) {
        filter = `${filter},equalizer=f=12000:t=q:w=0.5:g=2`;
      }
      
      return filter;
    } catch (error) {
      console.error('构建滤镜失败:', error);
      // 返回最基本的卡拉OK滤镜作为后备
      return 'pan=mono|c0=0.5*c0+-0.5*c1';
    }
  }

  /**
   * 兼容FFmpeg 8.0的谱减法滤镜 - 简化版
   */
  private buildCompatibleSpectralFilter(options: VocalRemovalOptions): string {
    const quality = options.quality || 'high';
    
    if (quality === 'ultra') {
      // 超高质量：简单滤镜链
      return [
        'pan=mono|c0=0.5*c0-0.5*c1',  // 立体声相位消除
        'highpass=f=80:poles=2',
        'lowpass=f=18000:poles=2',
        'equalizer=f=250:t=q:w=1.5:g=3',  // 增强低频
        'equalizer=f=1000:t=q:w=2:g=-6',  // 削减人声主频
        'equalizer=f=3000:t=q:w=2:g=-8',  // 削减人声高频
        'equalizer=f=8000:t=q:w=1.5:g=2',  // 增强高频细节
        'acompressor=threshold=0.15:ratio=6:attack=5:release=50:makeup=2',  // 动态压缩
        'alimiter=limit=0.95:attack=5:release=50'  // 限幅保护
      ].join(',');
    } else if (quality === 'high') {
      return [
        'pan=mono|c0=0.5*c0-0.5*c1',
        'highpass=f=100:poles=2',
        'lowpass=f=16000:poles=2',
        'equalizer=f=1000:t=q:w=2:g=-5',
        'equalizer=f=3000:t=q:w=2:g=-6',
        'acompressor=threshold=0.2:ratio=4:attack=8:release=60'
      ].join(',');
    } else {
      return 'pan=mono|c0=0.5*c0-0.5*c1,highpass=f=120:poles=2';
    }
  }

  /**
   * 兼容的维纳滤波
   */
  private buildCompatibleWienerFilter(options: VocalRemovalOptions): string {
    const quality = options.quality || 'high';
    
    if (quality === 'ultra') {
      return [
        'pan=mono|c0=0.5*c0+-0.5*c1',
        'anlmdn=s=7:p=0.002:r=0.01:o=3:m=15',
        'highpass=f=100:poles=2',
        'lowpass=f=15000:poles=2',
        'equalizer=f=150:t=q:w=200:g=-1',
        'equalizer=f=3000:t=q:w=1500:g=-2'
      ].join(',');
    } else if (quality === 'high') {
      return [
        'pan=mono|c0=0.5*c0+-0.5*c1',
        'anlmdn=s=5:p=0.005:r=0.02:o=2:m=10',
        'highpass=f=100:poles=2'
      ].join(',');
    } else {
      return 'pan=mono|c0=0.5*c0+-0.5*c1';
    }
  }

  /**
   * 兼容的盲源分离滤波
   */
  private buildCompatibleBSSFilter(options: VocalRemovalOptions): string {
    const quality = options.quality || 'high';
    
    if (quality === 'ultra') {
      return [
        'highpass=f=80:poles=2',
        'lowpass=f=16000:poles=2',
        'pan=mono|c0=0.5*c0+-0.5*c1',
        'aphaser=in_gain=0.6:out_gain=1:delay=1.0:decay=0.1:speed=0.8',
        'acompressor=threshold=0.25:ratio=3.5:attack=8:release=60',
        'equalizer=f=200:t=q:w=150:g=-2',
        'equalizer=f=800:t=q:w=500:g=-3',
        'equalizer=f=2500:t=q:w=1200:g=-4'
      ].join(',');
    } else if (quality === 'high') {
      return [
        'highpass=f=80:poles=2',
        'lowpass=f=16000:poles=2',
        'pan=mono|c0=0.5*c0+-0.5*c1',
        'acompressor=threshold=0.3:ratio=3:attack=10:release=80'
      ].join(',');
    } else {
      return 'pan=mono|c0=0.5*c0+-0.5*c1';
    }
  }

  /**
   * 兼容的HPSS滤波
   */
  private buildCompatibleHPSSFilter(options: VocalRemovalOptions): string {
    const quality = options.quality || 'high';
    
    if (quality === 'ultra') {
      return [
        'pan=mono|c0=0.5*c0+-0.5*c1',
        'aphaser=in_gain=0.7:out_gain=1:delay=1.5:decay=0.2:speed=0.6',
        'acompressor=threshold=0.2:ratio=4:attack=5:release=50',
        'equalizer=f=150:t=q:w=200:g=-1',
        'equalizer=f=800:t=q:w=400:g=-2',
        'equalizer=f=3000:t=q:w=1500:g=-3'
      ].join(',');
    } else if (quality === 'high') {
      return [
        'pan=mono|c0=0.5*c0+-0.5*c1',
        'acompressor=threshold=0.3:ratio=3:attack=10:release=80'
      ].join(',');
    } else {
      return 'pan=mono|c0=0.5*c0+-0.5*c1';
    }
  }

  /**
   * 兼容的多级处理滤波 - 简化版
   */
  private buildCompatibleMultistageFilter(options: VocalRemovalOptions): string {
    const quality = options.quality || 'high';
    
    if (quality === 'ultra') {
      // 终极人声消除：多级处理 + 频谱雕刻（简化版）
      return [
        'pan=mono|c0=0.5*c0-0.5*c1',  // 立体声相位消除
        // 第一级：频率范围控制
        'highpass=f=50:poles=4',  // 超低频滤除
        'lowpass=f=19000:poles=4',  // 超高频滤除
        // 第二级：人声频段精确削减
        'equalizer=f=150:t=q:w=1:g=5',  // 增强超低频
        'equalizer=f=300:t=q:w=1.5:g=3',  // 增强低频
        'equalizer=f=800:t=q:w=2:g=-4',  // 削减中低频人声
        'equalizer=f=1200:t=q:w=3:g=-10',  // 大幅削减人声基频
        'equalizer=f=2000:t=q:w=3:g=-12',  // 极大削减人声主频
        'equalizer=f=3000:t=q:w=3:g=-11',  // 极大削减人声高频
        'equalizer=f=4500:t=q:w=2.5:g=-6',  // 削减人声泛音
        'equalizer=f=7000:t=q:w=2:g=-3',  // 轻削减高频泛音
        'equalizer=f=11000:t=q:w=1.5:g=4',  // 增强高频细节
        'equalizer=f=15000:t=q:w=1:g=2',  // 增强超高频
        // 第三级：动态处理
        'acompressor=threshold=0.08:ratio=10:attack=2:release=30:makeup=4',  // 极强压缩
        'alimiter=limit=0.99:attack=2:release=30',  // 限幅
        // 第四级：噪声抑制
        'anlmdn=s=5:p=0.001:r=0.005:o=3:m=12',  // 降噪
        // 第五级：最终增益
        'volume=1.8'  // 大幅提升音量
      ].join(',');
    } else if (quality === 'high') {
      return [
        'pan=mono|c0=0.5*c0-0.5*c1',
        'highpass=f=80:poles=2',
        'lowpass=f=17000:poles=2',
        'equalizer=f=1200:t=q:w=2.5:g=-7',
        'equalizer=f=2500:t=q:w=2.5:g=-8',
        'equalizer=f=4000:t=q:w=2:g=-4',
        'acompressor=threshold=0.15:ratio=6:attack=4:release=40:makeup=2.5',
        'volume=1.4'
      ].join(',');
    } else {
      return [
        'pan=mono|c0=0.5*c0-0.5*c1',
        'highpass=f=100:poles=2',
        'equalizer=f=1500:t=q:w=2:g=-5',
        'acompressor=threshold=0.25:ratio=4:attack=8:release=60'
      ].join(',');
    }
  }

  /**
   * 兼容的频谱门控滤波
   */
  private buildCompatibleSpectralGatingFilter(options: VocalRemovalOptions): string {
    const quality = options.quality || 'high';
    
    if (quality === 'ultra') {
      return [
        'pan=mono|c0=0.5*c0+-0.5*c1',
        'aphaser=in_gain=0.7:out_gain=1:delay=1.5:decay=0.2:speed=0.6',
        'acompressor=threshold=0.3:ratio=3:attack=10:release=80',
        'equalizer=f=200:t=q:w=150:g=-2',
        'equalizer=f=800:t=q:w=400:g=-3'
      ].join(',');
    } else if (quality === 'high') {
      return [
        'pan=mono|c0=0.5*c0+-0.5*c1',
        'acompressor=threshold=0.3:ratio=3:attack=10:release=80'
      ].join(',');
    } else {
      return 'pan=mono|c0=0.5*c0+-0.5*c1';
    }
  }

  /**
   * 基础卡拉OK滤镜 - 简化版，避免复杂滤镜图问题
   */
  private buildKaraokeFilter(options: VocalRemovalOptions): string {
    const quality = options.quality || 'high';
    
    if (quality === 'ultra') {
      // 超高质量：使用简单滤镜链，避免复杂的分支
      return [
        'pan=mono|c0=0.5*c0-0.5*c1',  // 立体声相位消除
        'highpass=f=60:poles=2',  // 保留低音
        'lowpass=f=18000:poles=2',  // 保留高频
        'equalizer=f=200:t=q:w=1:g=4',  // 增强低频
        'equalizer=f=500:t=q:w=1.5:g=2',  // 增强中低频
        'equalizer=f=1200:t=q:w=3:g=-8',  // 削减人声主频
        'equalizer=f=2800:t=q:w=3:g=-10',  // 削减人声高频
        'equalizer=f=5000:t=q:w=2:g=-4',  // 削减人声泛音
        'equalizer=f=10000:t=q:w=1.5:g=3',  // 增强高频细节
        'acompressor=threshold=0.12:ratio=8:attack=3:release=40:makeup=3',  // 强压缩
        'alimiter=limit=0.98:attack=3:release=40',  // 限幅
        'volume=1.5'  // 提升音量
      ].join(',');
    } else if (quality === 'high') {
      return [
        'pan=mono|c0=0.5*c0-0.5*c1',  // 立体声相位消除
        'highpass=f=80:poles=2',
        'lowpass=f=16000:poles=2',
        'equalizer=f=1200:t=q:w=2.5:g=-6',
        'equalizer=f=2800:t=q:w=2.5:g=-7',
        'acompressor=threshold=0.2:ratio=5:attack=5:release=50:makeup=2',
        'volume=1.3'
      ].join(',');
    } else if (quality === 'medium') {
      return [
        'pan=mono|c0=0.5*c0-0.5*c1',
        'highpass=f=100:poles=2',
        'equalizer=f=1500:t=q:w=2:g=-5',
        'acompressor=threshold=0.3:ratio=3:attack=10:release=60'
      ].join(',');
    } else {
      return 'pan=mono|c0=0.5*c0-0.5*c1,highpass=f=120:poles=2';
    }
  }

  private buildBandpassFilter(options: VocalRemovalOptions): string {
    const quality = options.quality || 'high';
    
    if (quality === 'ultra' || quality === 'high') {
      return [
        'lowpass=f=85:poles=4',
        'highpass=f=3000:poles=4'
      ].join(',');
    } else {
      return 'bandreject=f=1000:w=2000';
    }
  }

  private buildPhaseFilter(options: VocalRemovalOptions): string {
    return [
      'pan=mono|c0=0.5*c0+-0.5*c1',
      'aphaser=in_gain=0.6:out_gain=1:delay=3.0:decay=0.4:speed=0.5'
    ].join(',');
  }

  private buildHighpassFilter(options: VocalRemovalOptions): string {
    const cutoffFreq = options.quality === 'high' ? 200 : 300;
    return `highpass=f=${cutoffFreq}:poles=2`;
  }

  /**
   * 执行FFmpeg命令 - 修复路径处理问题
   */
  private async executeFFmpeg(
    inputPath: string, 
    outputPath: string, 
    filter: string, 
    options: VocalRemovalOptions
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const quality = options.quality || 'high';
      const ffmpegPath = this.systemInfo?.ffmpegPath || 'ffmpeg';
      
      // 设置音频编码参数
      let audioCodec = [];
      const outputExt = path.extname(outputPath).toLowerCase();
      
      switch (outputExt) {
        case '.mp3':
          audioCodec = ['-codec:a', 'libmp3lame', '-b:a', quality === 'ultra' ? '320k' : quality === 'high' ? '256k' : '192k'];
          break;
        case '.m4a':
        case '.mp4':
          audioCodec = ['-codec:a', 'aac', '-b:a', quality === 'ultra' ? '256k' : quality === 'high' ? '192k' : '128k'];
          break;
        case '.flac':
          audioCodec = ['-codec:a', 'flac', '-compression_level', quality === 'ultra' ? '12' : '8'];
          break;
        case '.ogg':
          audioCodec = ['-codec:a', 'libvorbis', '-b:a', quality === 'ultra' ? '320k' : quality === 'high' ? '256k' : '192k'];
          break;
        default:
          // WAV或其他格式
          audioCodec = ['-codec:a', 'pcm_s16le'];
      }
      
      // 检测是否需要使用复杂滤镜
      // 如果滤镜包含标签（如 [a], [b]），则使用 -filter_complex
      const useComplexFilter = filter.includes('[') && filter.includes(']');
      const filterParam = useComplexFilter ? '-filter_complex' : '-af';
      
      // 构建完整的FFmpeg参数
      const ffmpegArgs = [
        '-i', inputPath,
        filterParam, filter,
        ...audioCodec,
        '-threads', '0',
        '-y',
        outputPath
      ];
      
      console.log('执行FFmpeg命令:', ffmpegPath, ffmpegArgs.join(' '));
      console.log('使用滤镜类型:', useComplexFilter ? '复杂滤镜 (-filter_complex)' : '简单滤镜 (-af)');
      
      this.currentProcess = spawn(ffmpegPath, ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let duration = 0;
      let progress = 0;
      let errorOutput = '';
      let hasOutput = false;
      
      // 监听标准输出
      this.currentProcess.stdout?.on('data', (data: Buffer) => {
        hasOutput = true;
        const output = data.toString();
        console.log('FFmpeg stdout:', output);
      });
      
      // 解析FFmpeg错误输出以获取进度
      this.currentProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        errorOutput += output;
        hasOutput = true;
        
        console.log('FFmpeg stderr:', output);
        
        // 提取总时长
        const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.?\d*)/);
        if (durationMatch) {
          duration = parseFloat(durationMatch[1]) * 3600 + 
                    parseFloat(durationMatch[2]) * 60 + 
                    parseFloat(durationMatch[3]);
          console.log('检测到音频时长:', duration, '秒');
        }
        
        // 提取当前进度
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.?\d*)/);
        if (timeMatch && duration > 0) {
          const currentTime = parseFloat(timeMatch[1]) * 3600 + 
                             parseFloat(timeMatch[2]) * 60 + 
                             parseFloat(timeMatch[3]);
          progress = Math.min((currentTime / duration) * 100, 99);
          this.sendProgressUpdate('processing', progress, `处理中... ${Math.round(progress)}%`);
        }
        
        // 检查特定错误
        if (output.toLowerCase().includes('no such file')) {
          console.error('FFmpeg错误: 文件不存在');
        } else if (output.toLowerCase().includes('permission denied')) {
          console.error('FFmpeg错误: 权限被拒绝');
        } else if (output.toLowerCase().includes('invalid data found')) {
          console.error('FFmpeg错误: 无效的音频数据');
        } else if (output.includes('Option not found')) {
          console.error('FFmpeg错误: 滤镜选项不存在');
        }
      });
      
      this.currentProcess.on('error', (error: Error) => {
        console.error('FFmpeg进程错误:', error);
        if (error.message.includes('ENOENT')) {
          console.error('FFmpeg可执行文件未找到，路径:', ffmpegPath);
        }
        this.currentProcess = null;
        resolve(false);
      });
      
      this.currentProcess.on('close', (code: number | null) => {
        console.log('FFmpeg进程结束，退出码:', code);
        console.log('是否有输出:', hasOutput);
        
        if (errorOutput) {
          console.log('完整错误输出:', errorOutput);
        }
        
        this.currentProcess = null;
        
        if (code === 0) {
          console.log('FFmpeg处理成功完成');
          resolve(true);
        } else if (code === 255 || code === null) {
          // 被取消或被杀死
          console.log('FFmpeg处理被取消或中断');
          resolve(false);
        } else {
          console.error('FFmpeg异常退出，退出码:', code);
          if (errorOutput.includes('Option not found')) {
            console.error('滤镜选项不兼容，建议使用基础算法');
          }
          resolve(false);
        }
      });

      // 设置超时处理
      const timeout = setTimeout(() => {
        if (this.currentProcess && !this.currentProcess.killed) {
          console.log('FFmpeg处理超时，强制终止');
          this.currentProcess.kill('SIGTERM');
          setTimeout(() => {
            if (this.currentProcess && !this.currentProcess.killed) {
              this.currentProcess.kill('SIGKILL');
            }
          }, 5000);
          resolve(false);
        }
      }, 10 * 60 * 1000); // 10分钟超时

      // 进程结束时清除超时
      this.currentProcess.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * 文件大小格式化
   */
  private formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * 获取可用的算法信息 - 更新为优化版本
   */
  private getAvailableAlgorithms() {
    const algorithms = {
      multistage: {
        name: '多级处理 (推荐★★★★★)',
        description: '终极人声消除算法：5级处理流程，精确频谱雕刻，效果最强',
        complexity: 'high',
        quality: 'ultra',
        speed: 'slow',
        recommended: true,
        compatible: true,
        effectLevel: 5
      },
      karaoke: {
        name: '卡拉OK模式 (推荐★★★★)',
        description: '优化的立体声处理，精确频率削减，效果优秀且稳定',
        complexity: 'medium',
        quality: 'high',
        speed: 'fast',
        recommended: true,
        compatible: true,
        effectLevel: 4
      },
      spectral: {
        name: '谱减法 (推荐★★★★)',
        description: '立体声分离配合动态压缩，保留音乐细节的同时有效消除人声',
        complexity: 'medium',
        quality: 'high',
        speed: 'medium',
        recommended: true,
        compatible: true,
        effectLevel: 4
      },
      bss: {
        name: '盲源分离 (★★★)',
        description: '多级频率处理和压缩，适合复杂音乐',
        complexity: 'high',
        quality: 'high',
        speed: 'slow',
        recommended: false,
        compatible: true,
        effectLevel: 3
      },
      hpss: {
        name: 'HPSS分离 (★★★)',
        description: '和声-打击乐分离的替代实现，效果稳定',
        complexity: 'medium',
        quality: 'high',
        speed: 'medium',
        recommended: false,
        compatible: true,
        effectLevel: 3
      },
      wiener: {
        name: '维纳滤波 (★★)',
        description: '使用噪声降低和声道处理，智能消除人声',
        complexity: 'medium',
        quality: 'medium',
        speed: 'medium',
        recommended: false,
        compatible: true,
        effectLevel: 2
      },
      spectral_gating: {
        name: '频谱门控 (★★)',
        description: '动态声道处理，自适应人声消除',
        complexity: 'medium',
        quality: 'medium',
        speed: 'medium',
        recommended: false,
        compatible: true,
        effectLevel: 2
      },
      phase: {
        name: '相位处理 (★)',
        description: '基于相位差的人声消除',
        complexity: 'low',
        quality: 'low',
        speed: 'fast',
        recommended: false,
        compatible: true,
        effectLevel: 1
      },
      bandpass: {
        name: '带通滤波 (★)',
        description: '通过频带控制消除人声频率范围',
        complexity: 'low',
        quality: 'low',
        speed: 'fast',
        recommended: false,
        compatible: true,
        effectLevel: 1
      },
      highpass: {
        name: '高通滤波',
        description: '简单的高频通过滤波，效果有限',
        complexity: 'low',
        quality: 'low',
        speed: 'very_fast',
        recommended: false,
        compatible: true,
        effectLevel: 1
      }
    };

    return {
      algorithms,
      systemReady: this.systemInfo?.ffmpegAvailable || false,
      ffmpegVersion: this.systemInfo?.version,
      note: '所有算法已优化，推荐使用"多级处理"或"卡拉OK模式"获得最佳效果',
      tips: [
        '选择"超高质量"可获得最佳人声消除效果',
        '处理时间较长的算法通常效果更好',
        '建议先用小文件测试不同算法的效果',
        '启用"保留低音"和"保留高频"可以保护音乐细节'
      ]
    };
  }

  /**
   * 批量处理文件
   */
  private async processBatch(
    files: string[], 
    outputDir: string, 
    options: Partial<VocalRemovalOptions>
  ): Promise<{ total: number; success: number; failed: number; results: ProcessingResult[] }> {
    const results: ProcessingResult[] = [];
    let successCount = 0;
    let failedCount = 0;
    
    // 验证输出目录
    try {
      await mkdir(outputDir, { recursive: true });
    } catch (error) {
      console.error('创建输出目录失败:', error);
      return {
        total: files.length,
        success: 0,
        failed: files.length,
        results: files.map(file => ({
          success: false,
          error: '无法创建输出目录'
        }))
      };
    }
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = path.basename(file, path.extname(file));
      const outputExt = '.wav';
      const outputPath = path.join(outputDir, `${fileName}_no_vocal${outputExt}`);
      
      // 发送批量处理进度
      this.sendProgressUpdate('batch', (i / files.length) * 100, `处理文件 ${i + 1}/${files.length}: ${fileName}`);
      
      const result = await this.processVocalRemoval({
        inputPath: file,
        outputPath,
        ...options
      } as VocalRemovalOptions);
      
      results.push(result);
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
      
      // 如果连续失败太多，提前停止
      if (failedCount > successCount && i > 2) {
        console.log('批量处理失败率过高，提前停止');
        break;
      }
    }
    
    return {
      total: files.length,
      success: successCount,
      failed: failedCount,
      results
    };
  }

  /**
   * 取消处理
   */
  private async cancelProcessing(): Promise<{ success: boolean; message?: string }> {
    try {
      if (this.currentProcess && !this.currentProcess.killed) {
        this.currentProcess.kill('SIGTERM');
        
        // 如果5秒后还没结束，强制杀死
        setTimeout(() => {
          if (this.currentProcess && !this.currentProcess.killed) {
            this.currentProcess.kill('SIGKILL');
          }
        }, 5000);
        
        this.currentProcess = null;
        this.isProcessing = false;
        this.sendProgressUpdate('cancelled', 0, '处理已取消');
        return { success: true, message: '处理已成功取消' };
      }
      return { success: false, message: '没有正在进行的处理任务' };
    } catch (error) {
      console.error('取消处理失败:', error);
      return { success: false, message: '取消处理时发生错误' };
    }
  }

  /**
   * 发送进度更新到渲染进程
   */
  private sendProgressUpdate(status: string, progress: number, message: string) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('vocal-remover:progress', {
        status,
        progress,
        message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * 清理资源
   */
  public cleanup() {
    if (this.currentProcess && !this.currentProcess.killed) {
      this.currentProcess.kill('SIGTERM');
      setTimeout(() => {
        if (this.currentProcess && !this.currentProcess.killed) {
          this.currentProcess.kill('SIGKILL');
        }
      }, 3000);
      this.currentProcess = null;
    }
    this.isProcessing = false;
  }

  /**
   * 获取详细的系统诊断信息
   */
  public async getDiagnostics(): Promise<{
    ffmpeg: { available: boolean; path?: string; version?: string; error?: string };
    permissions: { canRead: boolean; canWrite: boolean; details: string };
    paths: { input: string; output: string; temp: string };
    system: { platform: string; arch: string; nodeVersion: string };
    filters: { available: string[]; unavailable: string[] };
  }> {
    const ffmpegInfo = await this.detectFFmpeg();
    
    // 测试权限
    const permissionsTest = await this.testPermissions();
    
    // 获取路径信息
    const defaultPaths = this.getDefaultPaths();
    
    // 测试滤镜可用性
    const filterTests = await this.testFiltersAvailability();
    
    return {
      ffmpeg: {
        available: ffmpegInfo.available,
        path: ffmpegInfo.path,
        version: ffmpegInfo.version,
        error: !ffmpegInfo.available ? '未找到FFmpeg或无法执行' : undefined
      },
      permissions: permissionsTest,
      paths: defaultPaths,
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version
      },
      filters: filterTests
    };
  }

  /**
   * 测试滤镜可用性
   */
  private async testFiltersAvailability(): Promise<{ available: string[]; unavailable: string[] }> {
    const filtersToTest = ['pan', 'highpass', 'lowpass', 'acompressor', 'equalizer', 'aphaser', 'anlmdn'];
    const available: string[] = [];
    const unavailable: string[] = [];
    
    for (const filter of filtersToTest) {
      const isAvailable = await this.testFilterAvailability(filter);
      if (isAvailable) {
        available.push(filter);
      } else {
        unavailable.push(filter);
      }
    }
    
    return { available, unavailable };
  }

  /**
   * 测试系统权限
   */
  private async testPermissions(): Promise<{ canRead: boolean; canWrite: boolean; details: string }> {
    try {
      const tempDir = os.tmpdir();
      const testFile = path.join(tempDir, `vocal_remover_test_${Date.now()}.tmp`);
      
      // 测试写入权限
      let canWrite = false;
      try {
        await writeFile(testFile, 'test');
        canWrite = true;
        await unlink(testFile); // 清理测试文件
      } catch (error) {
        console.error('写入权限测试失败:', error);
      }
      
      // 测试读取权限
      let canRead = false;
      try {
        await readdir(tempDir);
        canRead = true;
      } catch (error) {
        console.error('读取权限测试失败:', error);
      }
      
      return {
        canRead,
        canWrite,
        details: canRead && canWrite ? '权限正常' : 
                canRead ? '只有读取权限，写入失败' : 
                canWrite ? '只有写入权限，读取失败' : 
                '读取和写入权限都不可用'
      };
    } catch (error) {
      return {
        canRead: false,
        canWrite: false,
        details: `权限测试失败: ${error}`
      };
    }
  }

  /**
   * 提供FFmpeg命令预览功能
   */
  public previewFFmpegCommand(options: VocalRemovalOptions): string {
    const filter = this.buildCompatibleAudioFilter(options);
    const ffmpegPath = this.systemInfo?.ffmpegPath || 'ffmpeg';
    
    return `${ffmpegPath} -i "${options.inputPath}" -af "${filter}" -codec:a pcm_s16le -threads 0 -y "${options.outputPath}"`;
  }

  /**
   * 简化的错误恢复处理
   */
  private async processVocalRemovalWithFallback(options: VocalRemovalOptions): Promise<ProcessingResult> {
    // 首先尝试用户选择的算法
    let result = await this.processVocalRemoval(options);
    
    if (!result.success && result.error?.includes('Option not found')) {
      console.log('原算法失败，尝试使用基础卡拉OK模式');
      
      // 回退到最基础的卡拉OK模式
      const fallbackOptions = {
        ...options,
        algorithm: 'karaoke' as const,
        quality: 'low' as const
      };
      
      result = await this.processVocalRemoval(fallbackOptions);
      
      if (result.success) {
        result.details = (result.details || '') + ' (使用了兼容模式)';
      }
    }
    
    return result;
  }
}

// 创建单例实例并导出
export const vocalRemoverManager = new VocalRemoverManager();

// 导出管理器类以便在其他地方使用
export default VocalRemoverManager;
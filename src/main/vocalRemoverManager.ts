import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

type VocalRemovalAlgorithm = 'demucs' | 'center_cancel' | 'karaoke';

interface VocalRemovalOptions {
  inputPath: string;
  outputPath: string;
  outputFileName?: string;
  algorithm?: VocalRemovalAlgorithm;
  quality?: 'low' | 'medium' | 'high' | 'ultra';
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
  ffmpegVersion?: string;
  demucsAvailable: boolean;
  demucsPath?: string;
  demucsModelAvailable: boolean;
  supportedFormats: string[];
  tempDir: string;
  platform: string;
}

interface ProcessRunResult {
  success: boolean;
  output: string;
  code: number | null;
}

class VocalRemoverManager {
  private isProcessing = false;
  private currentProcess: ReturnType<typeof spawn> | null = null;
  private mainWindow: BrowserWindow | null = null;
  private systemInfo: SystemInfo | null = null;

  private readonly modelFileName = 'htdemucs.safetensors';
  private readonly demucsModel = 'htdemucs';
  private readonly audioExtensions = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma', '.opus', '.aiff', '.aif'];

  constructor() {
    this.setupIpcHandlers();
    void this.initializeSystem();
  }

  public setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  public cleanup() {
    this.killCurrentProcess();
    this.isProcessing = false;
  }

  public previewFFmpegCommand(options: VocalRemovalOptions): string {
    const outputPath = this.resolveOutputFilePath(options);
    const filter = this.getCenterCancelFilter();
    return `${this.systemInfo?.ffmpegPath || 'ffmpeg'} -i "${options.inputPath}" -filter_complex "${filter}" -map "[a]" "${outputPath}"`;
  }

  private setupIpcHandlers() {
    ipcMain.handle('vocal-remover:process', async (_event, options: VocalRemovalOptions) => {
      return await this.processVocalRemoval(options);
    });

    ipcMain.handle('vocal-remover:getSystemInfo', async () => {
      if (!this.systemInfo) {
        this.systemInfo = await this.getSystemInfo();
      }
      return this.systemInfo;
    });

    ipcMain.handle('vocal-remover:selectInputFile', async () => {
      return await this.selectInputFile();
    });

    ipcMain.handle('vocal-remover:selectOutputDir', async () => {
      return await this.selectOutputDirectory();
    });

    ipcMain.handle('vocal-remover:validatePath', async (_event, filePath: string, type: 'input' | 'output') => {
      return await this.validatePath(filePath, type);
    });

    ipcMain.handle('vocal-remover:cancel', async () => {
      return await this.cancelProcessing();
    });

    ipcMain.handle('vocal-remover:getStatus', () => {
      return {
        isProcessing: this.isProcessing,
        systemReady: Boolean(this.systemInfo?.ffmpegAvailable),
        demucsReady: Boolean(this.systemInfo?.demucsAvailable && this.systemInfo?.demucsModelAvailable)
      };
    });

    ipcMain.handle('vocal-remover:processBatch', async (_event, files: string[], outputDir: string, options: Partial<VocalRemovalOptions>) => {
      return await this.processBatch(files, outputDir, options);
    });

    ipcMain.handle('vocal-remover:getAlgorithms', () => {
      return this.getAvailableAlgorithms();
    });

    ipcMain.handle('vocal-remover:checkFFmpeg', async () => {
      return await this.testFFmpegInstallation();
    });

    ipcMain.handle('vocal-remover:getDefaultPaths', () => {
      return this.getDefaultPaths();
    });
  }

  private async initializeSystem() {
    this.systemInfo = await this.getSystemInfo();
    console.log('伴奏提取系统初始化完成:', this.systemInfo);
  }

  private async getSystemInfo(): Promise<SystemInfo> {
    const ffmpegInfo = await this.detectFFmpeg();
    const demucsInfo = await this.detectDemucs();
    const modelPath = this.getBundledDemucsModelPath();

    return {
      ffmpegAvailable: ffmpegInfo.available,
      ffmpegPath: ffmpegInfo.path,
      ffmpegVersion: ffmpegInfo.version,
      demucsAvailable: demucsInfo.available,
      demucsPath: demucsInfo.path,
      demucsModelAvailable: Boolean(modelPath),
      supportedFormats: this.audioExtensions.map((ext) => ext.slice(1)),
      tempDir: os.tmpdir(),
      platform: os.platform()
    };
  }

  private async processVocalRemoval(options: VocalRemovalOptions): Promise<ProcessingResult> {
    if (this.isProcessing) {
      return { success: false, error: '已有处理任务正在进行中' };
    }

    const startTime = Date.now();
    let tempDir = '';

    try {
      if (!this.systemInfo) {
        this.systemInfo = await this.getSystemInfo();
      }

      const inputPath = options.inputPath;
      const validation = await this.validatePath(inputPath, 'input');
      if (!validation.valid) {
        return { success: false, error: validation.error || '输入文件不可用', details: validation.details };
      }

      const outputFilePath = this.resolveOutputFilePath(options);
      fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });

      this.isProcessing = true;
      this.sendProgressUpdate('processing', 0, '开始提取伴奏...');

      let method = 'Demucs AI 分离';
      let success = false;
      let details = '';

      try {
        tempDir = await this.processWithDemucs(inputPath, outputFilePath, options);
        success = true;
      } catch (error) {
        details = error instanceof Error ? error.message : String(error);
        console.warn('Demucs 提取伴奏失败，切换到兼容模式:', details);

        if (!this.systemInfo?.ffmpegAvailable) {
          throw new Error(`Demucs 不可用，且 FFmpeg 不可用。${details}`);
        }

        method = 'FFmpeg 兼容模式';
        this.sendProgressUpdate('processing', 15, 'AI 分离不可用，正在使用兼容模式...');
        success = await this.processWithCenterCancel(inputPath, outputFilePath, options);
      }

      if (!success) {
        throw new Error('伴奏提取失败');
      }

      const outputStats = fs.statSync(outputFilePath);
      if (outputStats.size === 0) {
        throw new Error('输出文件为空');
      }

      const duration = (Date.now() - startTime) / 1000;
      this.sendProgressUpdate('completed', 100, '伴奏提取完成');

      return {
        success: true,
        outputPath: outputFilePath,
        duration,
        details: `${method}完成，文件大小 ${this.formatFileSize(outputStats.size)}${details ? `；兼容信息：${details}` : ''}`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      console.error('伴奏提取失败:', error);
      this.sendProgressUpdate('failed', 0, `伴奏提取失败: ${message}`);
      return {
        success: false,
        error: message,
        details: '请确认音频文件可以正常播放，或换一个输出目录后重试。'
      };
    } finally {
      this.isProcessing = false;
      this.currentProcess = null;
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  private async processWithDemucs(inputPath: string, outputPath: string, options: VocalRemovalOptions): Promise<string> {
    const demucsPath = this.systemInfo?.demucsPath || (await this.detectDemucs()).path;
    const ffmpegPath = this.systemInfo?.ffmpegPath || (await this.detectFFmpeg()).path;

    if (!demucsPath) {
      throw new Error('未找到 Demucs 伴奏分离程序');
    }
    if (!ffmpegPath) {
      throw new Error('未找到 FFmpeg，无法合成伴奏文件');
    }

    this.ensureDemucsModelCached();

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wmp-demucs-'));
    const stemsDir = path.join(tempDir, 'stems');
    fs.mkdirSync(stemsDir, { recursive: true });

    this.sendProgressUpdate('processing', 5, '正在加载 AI 伴奏分离模型...');

    const demucsResult = await this.runCommand(
      demucsPath,
      ['-m', this.demucsModel, '-s', 'drums,bass,other', '-o', stemsDir, inputPath],
      {
        onData: (chunk) => this.handleDemucsOutput(chunk)
      }
    );

    if (!demucsResult.success) {
      throw new Error(this.summarizeProcessError('Demucs', demucsResult.output));
    }

    const stemPaths = ['drums.wav', 'bass.wav', 'other.wav'].map((name) => path.join(stemsDir, name));
    const missingStem = stemPaths.find((stemPath) => !fs.existsSync(stemPath));
    if (missingStem) {
      throw new Error(`Demucs 未生成必要的伴奏分轨: ${path.basename(missingStem)}`);
    }

    this.sendProgressUpdate('processing', 86, '正在合成伴奏文件...');
    await this.mixInstrumentalStems(ffmpegPath, stemPaths, outputPath, options);
    return tempDir;
  }

  private async mixInstrumentalStems(ffmpegPath: string, stemPaths: string[], outputPath: string, options: VocalRemovalOptions) {
    const codecArgs = this.getAudioCodecArgs(outputPath, options);
    const args = [
      '-y',
      '-i', stemPaths[0],
      '-i', stemPaths[1],
      '-i', stemPaths[2],
      '-filter_complex', '[0:a][1:a][2:a]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.98[a]',
      '-map', '[a]',
      ...codecArgs,
      outputPath
    ];

    const result = await this.runCommand(ffmpegPath, args, {
      onData: (chunk) => {
        const progress = this.parseFFmpegProgress(chunk, 86, 98);
        if (progress !== null) {
          this.sendProgressUpdate('processing', progress, `正在合成伴奏... ${Math.round(progress)}%`);
        }
      }
    });

    if (!result.success) {
      throw new Error(this.summarizeProcessError('FFmpeg 合成', result.output));
    }
  }

  private async processWithCenterCancel(inputPath: string, outputPath: string, options: VocalRemovalOptions): Promise<boolean> {
    const ffmpegPath = this.systemInfo?.ffmpegPath || 'ffmpeg';
    const codecArgs = this.getAudioCodecArgs(outputPath, options);
    const args = [
      '-y',
      '-i', inputPath,
      '-filter_complex', this.getCenterCancelFilter(),
      '-map', '[a]',
      ...codecArgs,
      outputPath
    ];

    const result = await this.runCommand(ffmpegPath, args, {
      onData: (chunk) => {
        const progress = this.parseFFmpegProgress(chunk, 15, 98);
        if (progress !== null) {
          this.sendProgressUpdate('processing', progress, `正在提取伴奏... ${Math.round(progress)}%`);
        }
      }
    });

    if (!result.success) {
      console.error('FFmpeg 兼容模式失败:', result.output);
    }

    return result.success;
  }

  private getCenterCancelFilter(): string {
    return [
      '[0:a]aformat=channel_layouts=stereo,asplit=2[orig][work]',
      '[work]pan=stereo|c0=c0-c1|c1=c1-c0,highpass=f=120,volume=1.25[side]',
      '[orig]lowpass=f=140,volume=0.55[bass]',
      '[side][bass]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.98[a]'
    ].join(';');
  }

  private async runCommand(
    command: string,
    args: string[],
    options: { onData?: (chunk: string) => void } = {}
  ): Promise<ProcessRunResult> {
    return await new Promise((resolve) => {
      let output = '';
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          LC_ALL: 'zh_CN.UTF-8',
          LANG: 'zh_CN.UTF-8'
        }
      });

      this.currentProcess = child;

      const handleData = (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;
        options.onData?.(chunk);
      };

      child.stdout?.on('data', handleData);
      child.stderr?.on('data', handleData);

      child.on('error', (error) => {
        output += `\n${error.message}`;
      });

      child.on('close', (code) => {
        if (this.currentProcess === child) {
          this.currentProcess = null;
        }
        resolve({ success: code === 0, output, code });
      });
    });
  }

  private handleDemucsOutput(chunk: string) {
    const text = chunk.toLowerCase();
    if (text.includes('loading cached model') || text.includes('downloading')) {
      this.sendProgressUpdate('processing', 10, '正在准备 AI 模型...');
    } else if (text.includes('reading')) {
      this.sendProgressUpdate('processing', 18, '正在读取音频...');
    } else if (text.includes('loading model')) {
      this.sendProgressUpdate('processing', 25, '正在加载 AI 模型...');
    } else if (text.includes('pre-compiling')) {
      this.sendProgressUpdate('processing', 32, '首次运行正在准备 GPU 加速...');
    } else if (text.includes('separating')) {
      this.sendProgressUpdate('processing', 42, '正在分离整首歌的伴奏...');
    } else if (text.includes('wrote')) {
      this.sendProgressUpdate('processing', 82, '伴奏分轨已生成...');
    }
  }

  private parseFFmpegProgress(chunk: string, minProgress: number, maxProgress: number): number | null {
    const durationMatch = chunk.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
    const timeMatch = chunk.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);

    const getSeconds = (match: RegExpMatchArray) =>
      Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);

    const duration = durationMatch ? getSeconds(durationMatch) : null;
    const current = timeMatch ? getSeconds(timeMatch) : null;

    if (!duration || !current) {
      return null;
    }

    return Math.min(maxProgress, minProgress + (current / duration) * (maxProgress - minProgress));
  }

  private ensureDemucsModelCached() {
    const bundledModel = this.getBundledDemucsModelPath();
    if (!bundledModel) {
      throw new Error('未找到内置 Demucs 模型文件');
    }

    const cacheDir = this.getDemucsCacheDir();
    const cacheModel = path.join(cacheDir, this.modelFileName);
    fs.mkdirSync(cacheDir, { recursive: true });

    const bundledSize = fs.statSync(bundledModel).size;
    const needsCopy = !fs.existsSync(cacheModel) || fs.statSync(cacheModel).size !== bundledSize;

    if (needsCopy) {
      fs.copyFileSync(bundledModel, cacheModel);
    }
  }

  private getDemucsCacheDir(): string {
    if (process.platform === 'win32') {
      return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'demucs-rs');
    }
    if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Caches', 'demucs-rs');
    }
    return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'demucs-rs');
  }

  private getBundledDemucsModelPath(): string | null {
    const candidates = this.uniquePaths([
      path.join(process.cwd(), 'resources', 'demucs', 'models', this.modelFileName),
      path.join(app.getAppPath(), 'resources', 'demucs', 'models', this.modelFileName),
      path.join(process.resourcesPath || '', 'demucs', 'models', this.modelFileName),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'resources', 'demucs', 'models', this.modelFileName),
      path.join(__dirname, '..', 'resources', 'demucs', 'models', this.modelFileName)
    ]);

    return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
  }

  private async detectDemucs(): Promise<{ available: boolean; path?: string }> {
    const executableName = process.platform === 'win32' ? 'demucs.exe' : 'demucs';
    const platformDir = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
    const executableDir = path.dirname(process.execPath);

    const candidates = this.uniquePaths([
      process.env.WMP_DEMUCS_PATH || '',
      path.join(process.cwd(), 'resources', 'demucs', platformDir, executableName),
      path.join(app.getAppPath(), 'resources', 'demucs', platformDir, executableName),
      path.join(process.resourcesPath || '', 'demucs', platformDir, executableName),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'resources', 'demucs', platformDir, executableName),
      path.join(executableDir, 'resources', 'demucs', platformDir, executableName),
      path.join(executableDir, '..', 'Resources', 'demucs', platformDir, executableName),
      executableName
    ]);

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        if (candidate !== executableName && !fs.existsSync(candidate)) {
          continue;
        }
        const result = await this.testExecutable(candidate, ['--help'], 'Separate audio stems');
        if (result) {
          return { available: true, path: candidate };
        }
      } catch {
        continue;
      }
    }

    return { available: false };
  }

  private async detectFFmpeg(): Promise<{ available: boolean; path?: string; version?: string }> {
    const executableName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const executableDir = path.dirname(process.execPath);

    const candidates = this.uniquePaths([
      process.env.FFMPEG_PATH || '',
      path.join(process.cwd(), 'resources', 'ffmpeg', executableName),
      path.join(app.getAppPath(), 'resources', 'ffmpeg', executableName),
      path.join(process.resourcesPath || '', 'ffmpeg', executableName),
      path.join(executableDir, 'ffmpeg', executableName),
      path.join(executableDir, '..', 'Resources', 'ffmpeg', executableName),
      'ffmpeg',
      'ffmpeg.exe',
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\Program Files\\FFmpeg\\bin\\ffmpeg.exe',
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg'
    ]);

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        if (!['ffmpeg', 'ffmpeg.exe'].includes(candidate) && !fs.existsSync(candidate)) {
          continue;
        }
        const version = await this.getFFmpegVersion(candidate);
        if (version) {
          return { available: true, path: candidate, version };
        }
      } catch {
        continue;
      }
    }

    return { available: false };
  }

  private async getFFmpegVersion(ffmpegPath: string): Promise<string | undefined> {
    return await new Promise((resolve) => {
      const child = spawn(ffmpegPath, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';

      child.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      child.on('error', () => resolve(undefined));
      child.on('close', (code) => {
        if (code !== 0 || !output.includes('ffmpeg version')) {
          resolve(undefined);
          return;
        }
        resolve(output.match(/ffmpeg version ([^\s]+)/)?.[1] || 'unknown');
      });

      setTimeout(() => {
        if (!child.killed) {
          child.kill();
          resolve(undefined);
        }
      }, 5000);
    });
  }

  private async testExecutable(command: string, args: string[], expectedText: string): Promise<boolean> {
    return await new Promise((resolve) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';

      child.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      child.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      child.on('error', () => resolve(false));
      child.on('close', () => resolve(output.includes(expectedText)));

      setTimeout(() => {
        if (!child.killed) {
          child.kill();
          resolve(false);
        }
      }, 5000);
    });
  }

  private getAudioCodecArgs(outputPath: string, options: VocalRemovalOptions): string[] {
    const outputExt = path.extname(outputPath).toLowerCase();
    const quality = options.quality || 'high';

    if (outputExt === '.wav') {
      return ['-codec:a', 'pcm_s16le'];
    }
    if (outputExt === '.flac') {
      return ['-codec:a', 'flac', '-compression_level', quality === 'ultra' ? '12' : '8'];
    }
    if (outputExt === '.m4a' || outputExt === '.aac') {
      return ['-codec:a', 'aac', '-b:a', quality === 'ultra' ? '256k' : '192k'];
    }
    if (outputExt === '.ogg') {
      return ['-codec:a', 'libvorbis', '-b:a', quality === 'ultra' ? '320k' : '256k'];
    }

    return ['-codec:a', 'libmp3lame', '-b:a', quality === 'ultra' ? '320k' : '256k'];
  }

  private resolveOutputFilePath(options: VocalRemovalOptions): string {
    const rawOutput = options.outputPath;
    const rawExt = path.extname(rawOutput);

    if (rawExt) {
      return rawOutput;
    }

    const inputName = path.basename(options.inputPath || 'output', path.extname(options.inputPath || ''));
    const fileName = options.outputFileName || `${inputName}_伴奏.mp3`;
    return path.join(rawOutput, fileName);
  }

  private async selectInputFile(): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!this.mainWindow) {
      return { success: false, error: '主窗口未初始化' };
    }

    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: '选择音频文件',
      filters: [
        { name: '音频文件', extensions: this.audioExtensions.map((ext) => ext.slice(1)) },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile'],
      defaultPath: this.getDefaultInputPath()
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '已取消选择' };
    }

    return { success: true, path: result.filePaths[0] };
  }

  private async selectOutputDirectory(): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!this.mainWindow) {
      return { success: false, error: '主窗口未初始化' };
    }

    const result = await dialog.showOpenDialog(this.mainWindow, {
      title: '选择输出目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: this.getDefaultOutputPath()
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '已取消选择' };
    }

    return { success: true, path: result.filePaths[0] };
  }

  private async validatePath(filePath: string, type: 'input' | 'output'): Promise<{ valid: boolean; error?: string; details?: string }> {
    try {
      if (!filePath) {
        return { valid: false, error: type === 'input' ? '请选择输入文件' : '请选择输出目录' };
      }

      if (type === 'input') {
        if (!fs.existsSync(filePath)) {
          return { valid: false, error: '输入文件不存在', details: filePath };
        }
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
          return { valid: false, error: '输入路径不是文件', details: filePath };
        }
        if (stats.size === 0) {
          return { valid: false, error: '输入文件为空', details: filePath };
        }
        const ext = path.extname(filePath).toLowerCase();
        if (!this.audioExtensions.includes(ext)) {
          return { valid: false, error: '不支持的音频格式', details: `支持格式: ${this.audioExtensions.join(', ')}` };
        }
        fs.accessSync(filePath, fs.constants.R_OK);
      } else {
        fs.mkdirSync(filePath, { recursive: true });
        const stats = fs.statSync(filePath);
        if (!stats.isDirectory()) {
          return { valid: false, error: '输出路径不是目录', details: filePath };
        }
        fs.accessSync(filePath, fs.constants.W_OK);
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: type === 'input' ? '无法读取输入文件' : '无法写入输出目录',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private getDefaultPaths() {
    return {
      input: this.getDefaultInputPath(),
      output: this.getDefaultOutputPath(),
      temp: os.tmpdir()
    };
  }

  private getDefaultInputPath(): string {
    try {
      return app.getPath('music');
    } catch {
      return app.getPath('home');
    }
  }

  private getDefaultOutputPath(): string {
    try {
      return app.getPath('desktop');
    } catch {
      return app.getPath('home');
    }
  }

  private getAvailableAlgorithms() {
    return {
      algorithms: {
        demucs: {
          name: 'AI 提取伴奏',
          description: '使用 Demucs 将整首歌分离为鼓、贝斯、其他乐器和人声，再合成无人声伴奏。',
          quality: 'high',
          speed: 'slow',
          recommended: true,
          compatible: Boolean(this.systemInfo?.demucsAvailable && this.systemInfo?.demucsModelAvailable)
        },
        center_cancel: {
          name: '兼容模式',
          description: '使用声道相位抵消提取伴奏，速度快，但只适合人声居中的歌曲。',
          quality: 'medium',
          speed: 'fast',
          recommended: false,
          compatible: Boolean(this.systemInfo?.ffmpegAvailable)
        }
      },
      systemReady: Boolean(this.systemInfo?.ffmpegAvailable),
      demucsReady: Boolean(this.systemInfo?.demucsAvailable && this.systemInfo?.demucsModelAvailable),
      note: '默认使用 AI 提取伴奏；如果本机 GPU/驱动不支持，会自动切换兼容模式。'
    };
  }

  private async testFFmpegInstallation(): Promise<{ available: boolean; details: string; suggestions?: string[] }> {
    const ffmpegInfo = await this.detectFFmpeg();
    if (!ffmpegInfo.available) {
      return {
        available: false,
        details: 'FFmpeg 不可用',
        suggestions: ['请确认应用资源目录中包含 FFmpeg，或将 FFmpeg 加入系统 PATH。']
      };
    }
    return { available: true, details: `FFmpeg 可用 (${ffmpegInfo.version || 'unknown'})` };
  }

  private async processBatch(
    files: string[],
    outputDir: string,
    options: Partial<VocalRemovalOptions>
  ): Promise<{ total: number; success: number; failed: number; results: ProcessingResult[] }> {
    const results: ProcessingResult[] = [];
    let success = 0;
    let failed = 0;

    fs.mkdirSync(outputDir, { recursive: true });

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const baseName = path.basename(file, path.extname(file));
      this.sendProgressUpdate('batch', (index / files.length) * 100, `正在处理 ${index + 1}/${files.length}: ${baseName}`);

      const result = await this.processVocalRemoval({
        ...options,
        inputPath: file,
        outputPath: outputDir,
        outputFileName: `${baseName}_伴奏.mp3`,
        algorithm: 'demucs',
        quality: options.quality || 'high'
      });

      results.push(result);
      if (result.success) {
        success += 1;
      } else {
        failed += 1;
      }
    }

    return { total: files.length, success, failed, results };
  }

  private async cancelProcessing(): Promise<{ success: boolean; message?: string }> {
    if (!this.currentProcess || this.currentProcess.killed) {
      return { success: false, message: '没有正在进行的处理任务' };
    }

    this.killCurrentProcess();
    this.isProcessing = false;
    this.sendProgressUpdate('cancelled', 0, '处理已取消');
    return { success: true, message: '处理已取消' };
  }

  private killCurrentProcess() {
    if (this.currentProcess && !this.currentProcess.killed) {
      this.currentProcess.kill('SIGTERM');
      setTimeout(() => {
        if (this.currentProcess && !this.currentProcess.killed) {
          this.currentProcess.kill('SIGKILL');
        }
      }, 3000);
    }
    this.currentProcess = null;
  }

  private sendProgressUpdate(status: string, progress: number, message: string) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    this.mainWindow.webContents.send('vocal-remover:progress', {
      status,
      progress: Math.max(0, Math.min(100, progress)),
      message,
      timestamp: new Date().toISOString()
    });
  }

  private summarizeProcessError(name: string, output: string): string {
    const usefulLine = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-6)
      .join(' | ');

    return `${name} 执行失败${usefulLine ? `: ${usefulLine}` : ''}`;
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
  }

  private uniquePaths(paths: string[]): string[] {
    return Array.from(new Set(paths.filter(Boolean)));
  }
}

export const vocalRemoverManager = new VocalRemoverManager();
export default VocalRemoverManager;

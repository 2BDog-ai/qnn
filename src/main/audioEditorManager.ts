 import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

interface AudioEditOptions {
  inputFile: string;
  outputFile: string;
  startTime: number;
  endTime: number;
  normalize?: boolean;
  format?: string;
}

interface AudioInfo {
  duration: number;
  sampleRate: number;
  channels: number;
  bitrate: number;
  format: string;
}

/**
 * 音频剪辑管理器
 */
export class AudioEditorManager {
  private mainWindow: BrowserWindow | null = null;
  private currentProcess: any = null;
  private ffmpegPath: string;

  constructor() {
    // 获取FFmpeg路径
    this.ffmpegPath = this.getFFmpegPath();
    console.log('🎬 AudioEditor初始化，FFmpeg路径:', this.ffmpegPath);
    
    this.setupIpcHandlers();
    
    // 验证FFmpeg是否可用
    this.verifyFFmpeg();
  }

  /**
   * 获取FFmpeg路径
   */
  private getFFmpegPath(): string {
    const platform = process.platform;
    const { app } = require('electron');
    
    try {
      // 获取正确的资源路径
      let resourcesPath: string;
      
      if (process.env.NODE_ENV === 'development') {
        // 开发环境：使用项目目录下的resources
        resourcesPath = path.join(process.cwd(), 'resources');
        console.log('🔧 开发环境，使用项目resources路径:', resourcesPath);
      } else {
        // 生产环境：根据平台使用不同的资源路径策略
        if (process.resourcesPath) {
          // process.resourcesPath 在macOS中指向 MyApp.app/Contents/Resources/
          // 所以我们的resources目录应该直接在这里
          resourcesPath = path.join(process.resourcesPath, 'resources');
          console.log('🔧 生产环境，使用process.resourcesPath:', resourcesPath);
          
          // 同时也检查是否直接在process.resourcesPath下
          const alternativePath = process.resourcesPath;
          console.log('🔧 备选路径检查:', alternativePath);
        } else {
          // 备用方案：使用app路径
          const appPath = app.getAppPath();
          if (platform === 'darwin') {
            // macOS: app包结构为 MyApp.app/Contents/Resources/
            resourcesPath = path.join(path.dirname(appPath), 'Resources', 'resources');
          } else {
            // 其他平台
            resourcesPath = path.join(appPath, 'resources');
          }
          console.log('🔧 生产环境，使用app路径备用方案:', resourcesPath);
        }
      }
      
      if (platform === 'win32') {
        // Windows: 使用内置的 FFmpeg
        const bundledPaths = [
          path.join(resourcesPath, 'ffmpeg', 'ffmpeg.exe'),
          path.join(resourcesPath, 'ffmpeg', 'win', 'ffmpeg.exe')
        ];
        console.log('🔍 尝试使用内置FFmpeg路径 (Windows):', bundledPaths);
        
        for (const bundledFFmpegPath of bundledPaths) {
          if (require('fs').existsSync(bundledFFmpegPath)) {
            console.log('✅ 找到内置FFmpeg (Windows):', bundledFFmpegPath);
            return bundledFFmpegPath;
          }
        }
        
        console.log('⚠️ 内置FFmpeg不存在，尝试系统FFmpeg');
        return 'ffmpeg.exe';
      } else if (platform === 'darwin') {
        // macOS: 尝试多个可能的FFmpeg路径
        // 根据实际打包结果，FFmpeg在Contents/ffmpeg/下
        const appPath = app.getAppPath();
        const possiblePaths = [
          // 开发环境路径
          path.join(resourcesPath, 'ffmpeg', 'ffmpeg'),
          // 打包后的实际路径：MyApp.app/Contents/ffmpeg/ffmpeg
          path.join(path.dirname(appPath), 'ffmpeg', 'ffmpeg'),
          // 如果appPath是asar包，向上一级查找
          path.join(path.dirname(path.dirname(appPath)), 'ffmpeg', 'ffmpeg'),
          // 使用process.resourcesPath的父目录
          path.join(process.resourcesPath ? path.dirname(process.resourcesPath) : '', 'ffmpeg', 'ffmpeg'),
          // 备用路径：Resources下
          path.join(process.resourcesPath || '', 'ffmpeg', 'ffmpeg')
        ].filter(p => p); // 过滤空路径
        
        console.log('🔍 尝试多个FFmpeg路径 (macOS):', possiblePaths);
        
        for (const ffmpegPath of possiblePaths) {
          if (require('fs').existsSync(ffmpegPath)) {
            console.log('✅ 找到内置FFmpeg (macOS):', ffmpegPath);
            return ffmpegPath;
          } else {
            console.log('❌ 路径不存在:', ffmpegPath);
          }
        }
        
        console.log('⚠️ 所有内置FFmpeg路径都不存在，尝试系统FFmpeg');
        return 'ffmpeg';
      } else {
        // Linux: 尝试内置，然后回退到系统FFmpeg
        const bundledFFmpegPath = path.join(resourcesPath, 'ffmpeg', 'ffmpeg');
        console.log('🔍 尝试使用内置FFmpeg路径 (Linux):', bundledFFmpegPath);
        
        if (require('fs').existsSync(bundledFFmpegPath)) {
          console.log('✅ 找到内置FFmpeg (Linux):', bundledFFmpegPath);
          return bundledFFmpegPath;
        } else {
          console.log('⚠️ 内置FFmpeg不存在，尝试系统FFmpeg');
          return 'ffmpeg';
        }
      }
    } catch (error) {
      console.error('❌ 获取FFmpeg路径失败:', error);
      // 回退到系统FFmpeg
      return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    }
  }

  /**
   * 验证FFmpeg是否可用
   */
  private async verifyFFmpeg() {
    try {
      console.log('🔍 正在验证FFmpeg，路径:', this.ffmpegPath);
      console.log('🔍 当前工作目录:', process.cwd());
      console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
      console.log('🔍 process.resourcesPath:', process.resourcesPath);
      
      // 检查文件是否存在
      const fs = require('fs');
      const fileExists = fs.existsSync(this.ffmpegPath);
      console.log('🔍 FFmpeg文件是否存在:', fileExists);
      
      if (fileExists) {
        const stats = fs.statSync(this.ffmpegPath);
        console.log('🔍 FFmpeg文件信息:', {
          size: stats.size,
          mode: stats.mode.toString(8),
          isFile: stats.isFile(),
          executable: !!(stats.mode & parseInt('111', 8))
        });
      } else {
        console.error('❌ FFmpeg文件不存在于路径:', this.ffmpegPath);
        return;
      }
      
      const testProcess = spawn(this.ffmpegPath, ['-version']);
      
      let hasOutput = false;
      
      testProcess.stdout.on('data', (data) => {
        hasOutput = true;
        const output = data.toString();
        console.log('✅ FFmpeg验证成功:', output.split('\n')[0]);
      });
      
      testProcess.stderr.on('data', (data) => {
        hasOutput = true;
        const output = data.toString();
        console.log('✅ FFmpeg验证成功:', output.split('\n')[0]);
      });
      
      testProcess.on('error', (error) => {
        console.error('❌ FFmpeg不可用:', error.message);
        console.log('💡 解决方案:');
        console.log('   macOS: brew install ffmpeg');
        console.log('   Windows: winget install ffmpeg');
        console.log('   或手动下载FFmpeg并配置PATH环境变量');
      });
      
      testProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ FFmpeg验证完成，音频编辑功能可用');
        } else {
          console.error('❌ FFmpeg验证失败，错误码:', code);
        }
      });
      
      // 5秒超时
      setTimeout(() => {
        if (!hasOutput) {
          console.warn('⚠️ FFmpeg验证超时，可能存在问题');
          testProcess.kill();
        }
      }, 5000);
      
    } catch (error) {
      console.error('❌ 验证FFmpeg失败:', error);
    }
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
    // 获取音频信息
    ipcMain.handle('audio-editor:getInfo', async (event, filePath: string) => {
      return await this.getAudioInfo(filePath);
    });

    // 生成波形数据
    ipcMain.handle('audio-editor:getWaveform', async (event, filePath: string) => {
      return await this.generateWaveform(filePath);
    });

    // 剪辑音频
    ipcMain.handle('audio-editor:trim', async (event, options: AudioEditOptions) => {
      return await this.trimAudio(options);
    });

    // 合并音频
    ipcMain.handle('audio-editor:merge', async (event, files: string[], outputFile: string) => {
      return await this.mergeAudio(files, outputFile);
    });

    // 调整音量
    ipcMain.handle('audio-editor:adjustVolume', async (event, inputFile: string, outputFile: string, volume: number) => {
      return await this.adjustVolume(inputFile, outputFile, volume);
    });

    // 取消当前操作
    ipcMain.handle('audio-editor:cancel', () => {
      return this.cancelOperation();
    });

    // 选择音频文件
    ipcMain.handle('audio-editor:selectFile', async () => {
      if (!this.mainWindow) return null;
      
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'opus'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });
      
      return result.canceled ? null : result.filePaths[0];
    });

    // 选择保存位置 - 仅限MP3格式
    ipcMain.handle('audio-editor:selectSaveLocation', async (event, defaultName: string) => {
      if (!this.mainWindow) return null;
      
      const result = await dialog.showSaveDialog(this.mainWindow, {
        defaultPath: defaultName,
        filters: [
          { name: 'MP3音频', extensions: ['mp3'] }
        ]
      });
      
      return result.canceled ? null : result.filePath;
    });

    // 获取文件URL（用于音频播放）
    ipcMain.handle('audio-editor:getFileUrl', async (event, filePath: string) => {
      try {
        // 检查文件是否存在
        await fs.access(filePath);
        // 返回文件URL
        return { success: true, url: `file://${filePath}` };
      } catch (error) {
        console.error('文件不存在:', filePath);
        return { success: false, error: '文件不存在' };
      }
    });
  }

  /**
   * 检查FFmpeg是否可用
   */
  private async isFFmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const testProcess = spawn(this.ffmpegPath, ['-version']);
        
        testProcess.on('error', () => {
          resolve(false);
        });
        
        testProcess.on('close', (code) => {
          resolve(code === 0);
        });
        
        // 2秒超时
        setTimeout(() => {
          testProcess.kill();
          resolve(false);
        }, 2000);
      } catch (error) {
        resolve(false);
      }
    });
  }

  /**
   * 获取音频信息
   */
  private async getAudioInfo(filePath: string): Promise<AudioInfo | null> {
    return new Promise((resolve) => {
      console.log('🔍 获取音频信息:', filePath);
      
      const args = [
        '-i', filePath,
        '-hide_banner',
        '-loglevel', 'info'
      ];

      console.log('🛠️ 执行命令:', this.ffmpegPath, args.join(' '));
      const ffprobe = spawn(this.ffmpegPath, args);
      let output = '';
      let errorOutput = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffprobe.on('close', (code) => {
        try {
          console.log('🔍 FFmpeg进程结束，退出码:', code);
          console.log('📊 输出内容:', errorOutput.slice(0, 200) + '...');
          
          // 解析FFmpeg输出获取音频信息
          const durationMatch = errorOutput.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d+)/);
          const audioMatch = errorOutput.match(/Audio:\s*([^,\s]+).*?(\d+)\s*Hz/i);
          const bitrateMatch = errorOutput.match(/(\d+)\s*kb\/s/i);
          const channelMatch = errorOutput.match(/Audio:.+?(mono|stereo|5\.1)/);

          if (durationMatch) {
            const hours = parseFloat(durationMatch[1]);
            const minutes = parseFloat(durationMatch[2]);
            const seconds = parseFloat(durationMatch[3]);
            const duration = hours * 3600 + minutes * 60 + seconds;

            const channels = channelMatch 
              ? (channelMatch[1] === 'mono' ? 1 : channelMatch[1] === 'stereo' ? 2 : 6)
              : 2;

            const audioInfo = {
              duration,
              sampleRate: audioMatch ? parseInt(audioMatch[2]) : 44100,
              channels,
              bitrate: bitrateMatch ? parseInt(bitrateMatch[1]) : 0,
              format: audioMatch ? audioMatch[1] : path.extname(filePath).replace('.', '') || 'unknown'
            };
            
            console.log('✅ 音频信息解析成功:', audioInfo);
            resolve(audioInfo);
          } else {
            console.error('❌ 无法解析音频信息');
            console.error('   期望找到 Duration 和 Audio 字段');
            console.error('   实际输出:', errorOutput);
            resolve(null);
          }
        } catch (error) {
          console.error('❌ 解析音频信息失败:', error);
          resolve(null);
        }
      });
      
      ffprobe.on('error', (error) => {
        console.error('❌ FFprobe执行错误:', error);
        resolve(null);
      });
    });
  }

  /**
   * 生成波形数据
   */
  private async generateWaveform(filePath: string): Promise<number[] | null> {
    return new Promise((resolve) => {
      console.log('????????:', filePath);
      let settled = false;
      let ffmpeg: ReturnType<typeof spawn> | null = null;

      const finish = (value: number[] | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };

      const timeout = setTimeout(() => {
        console.warn('???????????');
        try { ffmpeg?.kill('SIGKILL'); } catch {}
        finish(null);
      }, 8000);

      const args = [
        '-nostdin',
        '-i', filePath,
        '-vn',
        '-sn',
        '-map', '0:a:0',
        '-f', 's16le',
        '-ac', '1',
        '-ar', '800',
        'pipe:1'
      ];

      ffmpeg = spawn(this.ffmpegPath, args);
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const maxBytes = 2 * 1024 * 1024;

      ffmpeg.stdout.on('data', (chunk) => {
        if (settled) return;
        totalBytes += chunk.length;
        chunks.push(chunk);
        if (totalBytes >= maxBytes) {
          try { ffmpeg?.kill('SIGTERM'); } catch {}
        }
      });

      ffmpeg.on('close', () => {
        if (settled) return;
        try {
          const buffer = Buffer.concat(chunks);
          if (buffer.length < 2) {
            finish(null);
            return;
          }

          const samples = new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 2));
          const targetSamples = 1000;
          const step = Math.max(1, Math.floor(samples.length / targetSamples));
          const waveform: number[] = [];

          for (let i = 0; i < samples.length; i += step) {
            let max = 0;
            for (let j = 0; j < step && i + j < samples.length; j++) {
              const abs = Math.abs(samples[i + j]);
              if (abs > max) max = abs;
            }
            waveform.push(max / 32768);
            if (waveform.length >= targetSamples) break;
          }

          finish(waveform);
        } catch (error) {
          console.error('????????:', error);
          finish(null);
        }
      });

      ffmpeg.on('error', (error) => {
        console.error('FFmpeg??:', error);
        finish(null);
      });
    });
  }

  /**
   * 剪辑音频，输入支持常见音频格式，输出统一为 MP3。
   */
  private async trimAudio(options: AudioEditOptions): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // 验证输入文件格式
      const inputExt = options.inputFile.toLowerCase().split('.').pop();
      const supportedInput = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'opus'];
      if (!inputExt || !supportedInput.includes(inputExt)) {
        resolve({ success: false, error: `不支持的音频格式：${inputExt || '未知'}` });
        return;
      }

      if (!Number.isFinite(options.startTime) || !Number.isFinite(options.endTime) || options.endTime <= options.startTime) {
        resolve({ success: false, error: '剪辑时间范围不正确' });
        return;
      }
      
      console.log('✂️ 开始剪辑音频:', options);
      
      // 构建FFmpeg命令参数
      const args: string[] = [
        '-nostdin',
        '-i', options.inputFile,
        '-ss', options.startTime.toString(),
        '-t', (options.endTime - options.startTime).toString(), // 使用持续时间而不是结束时间
      ];

      // 收集音频过滤器
      const filters: string[] = [];
      
      // 音量标准化
      if (options.normalize) {
        filters.push('loudnorm');
      }
      
      // 确保输出为MP3格式。统一重新编码，避免 WAV/M4A/WMA 输入或 MP3 帧边界导致剪辑失败。
      if (filters.length > 0) {
        args.push('-af', filters.join(','));
      }
      args.push('-vn', '-sn', '-map', '0:a:0', '-acodec', 'libmp3lame', '-b:a', '320k');
      
      // 强制MP3格式
      args.push('-f', 'mp3');

      // 避免元数据问题
      args.push('-map_metadata', '0');
      args.push('-avoid_negative_ts', 'make_zero');
      
      // 输出文件（覆盖已存在的）
      args.push('-y', options.outputFile);

      console.log('执行FFmpeg命令:');
      console.log('ffmpeg', args.join(' '));
      console.log('输入文件:', options.inputFile);
      console.log('输出文件:', options.outputFile);
      console.log('时间范围:', options.startTime, '->', options.endTime);

      this.currentProcess = spawn(this.ffmpegPath, args);
      
      let errorOutput = '';
      
      this.currentProcess.stderr.on('data', (data: Buffer) => {
        const message = data.toString();
        errorOutput += message;
        
        // 解析进度
        const progressMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
        if (progressMatch) {
          const hours = parseFloat(progressMatch[1]);
          const minutes = parseFloat(progressMatch[2]);
          const seconds = parseFloat(progressMatch[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          const duration = options.endTime - options.startTime;
          const progress = (currentTime / duration) * 100;
          
          // 发送进度到渲染进程
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('audio-editor:progress', {
              type: 'trim',
              progress: Math.min(progress, 100)
            });
          }
        }
      });

      this.currentProcess.on('close', (code: number) => {
        this.currentProcess = null;
        
        if (code === 0) {
          resolve({ success: true });
        } else {
          console.error('FFmpeg错误输出:', errorOutput);
          resolve({ 
            success: false, 
            error: `剪辑失败 (错误码: ${code})` 
          });
        }
      });

      this.currentProcess.on('error', (error: Error) => {
        this.currentProcess = null;
        console.error('FFmpeg执行错误:', error);
        resolve({ 
          success: false, 
          error: error.message 
        });
      });
    });
  }

  /**
   * 合并音频文件
   */
  private async mergeAudio(files: string[], outputFile: string): Promise<{ success: boolean; error?: string }> {
    return new Promise(async (resolve) => {
      try {
        // 创建文件列表
        const listFile = path.join(path.dirname(outputFile), 'concat_list.txt');
        const fileContent = files.map(f => `file '${f}'`).join('\n');
        await fs.writeFile(listFile, fileContent);

        const args = [
          '-f', 'concat',
          '-safe', '0',
          '-i', listFile,
          '-c', 'copy',
          '-y', outputFile
        ];

        this.currentProcess = spawn(this.ffmpegPath, args);
        
        this.currentProcess.on('close', async (code: number) => {
          this.currentProcess = null;
          
          // 删除临时文件
          try {
            await fs.unlink(listFile);
          } catch (error) {
            console.error('删除临时文件失败:', error);
          }
          
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({ 
              success: false, 
              error: `合并失败 (错误码: ${code})` 
            });
          }
        });

        this.currentProcess.on('error', (error: Error) => {
          this.currentProcess = null;
          resolve({ 
            success: false, 
            error: error.message 
          });
        });
      } catch (error) {
        resolve({
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        });
      }
    });
  }

  /**
   * 调整音量
   */
  private async adjustVolume(inputFile: string, outputFile: string, volume: number): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // volume: 0.5 = 50%, 1.0 = 100%, 2.0 = 200%
      const args = [
        '-i', inputFile,
        '-filter:a', `volume=${volume}`,
        '-y', outputFile
      ];

      this.currentProcess = spawn(this.ffmpegPath, args);
      
      this.currentProcess.on('close', (code: number) => {
        this.currentProcess = null;
        
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ 
            success: false, 
            error: `调整音量失败 (错误码: ${code})` 
          });
        }
      });

      this.currentProcess.on('error', (error: Error) => {
        this.currentProcess = null;
        resolve({ 
          success: false, 
          error: error.message 
        });
      });
    });
  }

  /**
   * 取消当前操作
   */
  private cancelOperation(): boolean {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
      return true;
    }
    return false;
  }

  /**
   * 清理资源
   */
  public cleanup() {
    this.cancelOperation();
  }
}

// 导出单例
export const audioEditorManager = new AudioEditorManager();

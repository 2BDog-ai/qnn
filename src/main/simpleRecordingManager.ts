import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { resolveFFmpegTool } from './ffmpegResolver';

const mkdir = promisify(fs.mkdir);

interface ConsoleRecordingOptions {
  deviceId?: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  outputFormat: 'wav' | 'mp3' | 'flac';
  outputPath: string;
}

interface RecordingSession {
  id: string;
  startTime: Date;
  outputPath: string;
  status: 'recording' | 'stopped' | 'error';
  error?: string;
}

class SimpleRecordingManager {
  private isRecording = false;
  private currentSession: RecordingSession | null = null;
  private recordingProcess: any = null;
  private mainWindow: BrowserWindow | null = null;
  private deviceCache: Array<{ id: string; name: string; type: string }> | null = null;
  private lastCacheTime: number = 0;
  private CACHE_DURATION = 60000; // 1 minute cache

  constructor() {
    this.setupIpcHandlers();
  }

  public setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  private setupIpcHandlers() {
    // 获取音频设备列表（简化版）
    ipcMain.handle('console-recording:getDevices', async () => {
      console.log('获取音频设备列表...');
      return await this.getAudioDevices();
    });

    // 开始录音
    ipcMain.handle('console-recording:start', async (event, options: ConsoleRecordingOptions) => {
      console.log('开始录音请求:', options);
      return await this.startRecording(options);
    });

    // 停止录音
    ipcMain.handle('console-recording:stop', async () => {
      console.log('停止录音请求');
      return await this.stopRecording();
    });

    // 获取录音状态
    ipcMain.handle('console-recording:getStatus', () => {
      return {
        isRecording: this.isRecording,
        session: this.currentSession
      };
    });
  }

  private getFFmpegPath(): string {
    return resolveFFmpegTool('ffmpeg');
  }

  /**
   * 获取音频设备 - 简化版
   */
  private async getAudioDevices(): Promise<Array<{ id: string; name: string; type: string }>> {
    const now = Date.now();
    // Temporarily disable cache to force refresh every time
    // if (this.deviceCache && (now - this.lastCacheTime) < this.CACHE_DURATION) {
    //   console.log('Using cached audio devices');
    //   return this.deviceCache;
    // }

    return new Promise((resolve) => {
      if (process.platform === 'darwin') {
        // macOS - 使用FFmpeg获取avfoundation设备
        const ffmpegPath = this.getFFmpegPath();
        const ffmpeg = spawn(ffmpegPath, ['-f', 'avfoundation', '-list_devices', 'true', '-i', '']);
        let output = '';
        
        ffmpeg.stderr.on('data', (data) => {
          output += data.toString();
        });

        ffmpeg.on('close', () => {
          const devices: Array<{ id: string; name: string; type: string }> = [];
          
          // 更鲁棒的解析：查找所有 [number] name 行在音频部分
          const lines = output.split('\n');
          let inAudioSection = false;
          lines.forEach(line => {
            if (line.includes('AVFoundation audio devices:')) {
              inAudioSection = true;
            } else if (line.includes('AVFoundation video devices:')) {
              inAudioSection = false;
            } else if (inAudioSection) {
              const match = line.match(/\[\s*(\d+)\s*\]\s*(.+)/); // 更宽松匹配
              if (match) {
                devices.push({
                  id: match[1],
                  name: match[2].trim(),
                  type: 'input'
                });
              }
            }
          });

          // 如果没有找到设备，添加默认
          if (devices.length === 0) {
            devices.push({ id: '0', name: '默认音频输入', type: 'input' });
          }

          console.log('找到音频设备:', devices);
          this.deviceCache = devices;
          this.lastCacheTime = now;
          resolve(devices);
        });

        // 超时处理 - 缩短为1秒
        setTimeout(() => {
          if (!ffmpeg.killed) {
            ffmpeg.kill();
            const defaultDevices = [{ id: '0', name: '默认音频输入', type: 'input' }];
            this.deviceCache = defaultDevices;
            this.lastCacheTime = now;
            resolve(defaultDevices);
          }
        }, 500); // Reduced to 500ms
      } else {
        const ffmpegPath = this.getFFmpegPath();
        const inputFormat = process.platform === 'win32' ? 'dshow' : 'pulse';
        const args = process.platform === 'win32'
          ? ['-hide_banner', '-list_devices', 'true', '-f', inputFormat, '-i', 'dummy']
          : ['-hide_banner', '-f', inputFormat, '-sources', 'default'];
        const ffmpeg = spawn(ffmpegPath, args);
        let output = '';

        ffmpeg.stderr.on('data', (data) => {
          output += data.toString();
        });

        ffmpeg.on('close', () => {
          const devices: Array<{ id: string; name: string; type: string }> = [];
          const seen = new Set<string>();

          for (const line of output.split(/\r?\n/)) {
            const match = line.match(/"([^"]+)"\s*\((audio|video)\)/i) || line.match(/"([^"]+)"/);
            if (!match) continue;
            const name = match[1].trim();
            const type = match[2]?.toLowerCase();
            if (type && type !== 'audio') continue;
            if (seen.has(name)) continue;
            seen.add(name);
            devices.push({
              id: process.platform === 'win32' ? `audio=${name}` : name,
              name,
              type: 'input'
            });
          }

          this.deviceCache = devices;
          this.lastCacheTime = now;
          resolve(devices);
        });

        ffmpeg.on('error', () => {
          this.deviceCache = [];
          this.lastCacheTime = now;
          resolve([]);
        });

        setTimeout(() => {
          if (!ffmpeg.killed) {
            ffmpeg.kill('SIGTERM');
            resolve(this.deviceCache || []);
          }
        }, 3000);
      }
    });
  }

  private async resolveWindowsDshowAudioInput(deviceId?: string): Promise<string> {
    const rawDeviceId = (deviceId || '').trim();
    if (
      rawDeviceId
      && !/^\d+$/.test(rawDeviceId)
      && rawDeviceId.toLowerCase() !== 'default'
      && rawDeviceId.toLowerCase() !== 'audio=default'
    ) {
      return rawDeviceId.startsWith('audio=') ? rawDeviceId : `audio=${rawDeviceId}`;
    }

    const devices = this.deviceCache || await this.getAudioDevices();
    const input = devices.find(device =>
      device.type === 'input'
      && device.id.startsWith('audio=')
      && device.id.toLowerCase() !== 'audio=default'
    );
    if (input) return input.id;

    throw new Error('未检测到可用的Windows录音设备');
  }

  /**
   * 开始录音
   */
  private async startRecording(options: ConsoleRecordingOptions): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    try {
      if (this.isRecording) {
        return { success: false, error: '已有录音正在进行' };
      }

      console.log('创建输出目录...');
      await mkdir(path.dirname(options.outputPath), { recursive: true });

      // 创建录音会话
      const sessionId = `rec_${Date.now()}`;
      this.currentSession = {
        id: sessionId,
        startTime: new Date(),
        outputPath: options.outputPath,
        status: 'recording'
      };

      this.isRecording = true;

      // 启动FFmpeg录音
      console.log('启动FFmpeg录音...');
      const success = await this.startFFmpegRecording(options);
      
      if (!success) {
        this.isRecording = false;
        this.currentSession = null;
        return { success: false, error: 'FFmpeg启动失败' };
      }

      // 通知渲染进程
      if (this.mainWindow) {
        this.mainWindow.webContents.send('console-recording:started', options.outputPath);
      }

      return { success: true, sessionId };
    } catch (error) {
      console.error('开始录音失败:', error);
      this.isRecording = false;
      this.currentSession = null;
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 使用FFmpeg录音
   */
  private async startFFmpegRecording(options: ConsoleRecordingOptions): Promise<boolean> {
    return new Promise(async (resolve) => {
      let ffmpegArgs: string[] = [];

      if (process.platform === 'darwin') {
        // macOS使用avfoundation
        const audioInput = options.deviceId ? ':' + options.deviceId : ':0';
        
        ffmpegArgs = [
          '-f', 'avfoundation',
          '-i', audioInput,
          '-ar', options.sampleRate.toString(),
          '-ac', options.channels.toString()
        ];

        // 根据格式设置编码器
        if (options.outputFormat === 'mp3') {
          ffmpegArgs.push('-acodec', 'libmp3lame', '-b:a', '320k');
        } else if (options.outputFormat === 'flac') {
          ffmpegArgs.push('-acodec', 'flac');
        } else {
          // WAV格式
          ffmpegArgs.push('-acodec', 'pcm_s' + options.bitDepth + 'le');
        }

        ffmpegArgs.push('-y', options.outputPath);
      } else {
        // Windows/Linux
        let inputDevice: string;
        try {
          inputDevice = process.platform === 'win32'
            ? await this.resolveWindowsDshowAudioInput(options.deviceId)
            : (options.deviceId || 'default');
        } catch (error) {
          console.error('解析录音设备失败:', error);
          resolve(false);
          return;
        }
        const inputFormat = process.platform === 'win32' ? 'dshow' : 'pulse';
        
        ffmpegArgs = [
          '-hide_banner',
          '-loglevel', 'warning',
          ...(process.platform === 'win32' ? ['-nostdin'] : []),
          '-f', inputFormat,
          '-i', inputDevice,
          '-ar', options.sampleRate.toString(),
          '-ac', options.channels.toString()
        ];

        // 根据格式设置编码器
        if (options.outputFormat === 'mp3') {
          ffmpegArgs.push('-acodec', 'libmp3lame', '-b:a', '320k');
        } else if (options.outputFormat === 'flac') {
          ffmpegArgs.push('-acodec', 'flac');
        } else {
          ffmpegArgs.push('-acodec', 'pcm_s' + options.bitDepth + 'le');
        }

        ffmpegArgs.push('-y', options.outputPath);
      }

      console.log('FFmpeg命令: ffmpeg', ffmpegArgs.join(' '));
      
      const ffmpegPath = this.getFFmpegPath();
      this.recordingProcess = spawn(ffmpegPath, ffmpegArgs, { windowsHide: true });
      
      let hasStarted = false;

      this.recordingProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        // 检查是否开始录音
        if (!hasStarted && (output.includes('Press [q] to stop') || output.includes('size='))) {
          hasStarted = true;
          console.log('FFmpeg录音已开始');
          resolve(true);
        }
        // 只输出错误
        if (output.includes('error') || output.includes('Error')) {
          console.error('FFmpeg错误:', output);
        }
      });

      this.recordingProcess.on('error', (error: Error) => {
        console.error('FFmpeg进程错误:', error);
        if (this.currentSession) {
          this.currentSession.status = 'error';
          this.currentSession.error = error.message;
        }
        if (!hasStarted) {
          resolve(false);
        }
      });

      this.recordingProcess.on('close', (code: number) => {
        console.log('FFmpeg进程退出，代码:', code);
        if (!hasStarted && code !== 0) {
          resolve(false);
        }
      });

      setTimeout(() => {
        if (!hasStarted && this.recordingProcess && this.recordingProcess.exitCode === null) {
          hasStarted = true;
          console.log('FFmpeg录音进程已稳定运行');
          resolve(true);
        }
      }, process.platform === 'win32' ? 1200 : 2000);

      // 超时检查
      setTimeout(() => {
        if (!hasStarted) {
          console.error('FFmpeg启动超时');
          if (this.recordingProcess && !this.recordingProcess.killed) {
            this.recordingProcess.kill();
          }
          resolve(false);
        }
      }, 5000);
    });
  }

  /**
   * 停止录音
   */
  private async stopRecording(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isRecording || !this.recordingProcess) {
        return { success: false, error: '没有正在进行的录音' };
      }

      console.log('停止FFmpeg录音...');
      
      // 优雅停止FFmpeg
      if (process.platform !== 'win32' && this.recordingProcess.stdin && !this.recordingProcess.stdin.destroyed) {
        this.recordingProcess.stdin.write('q');
      } else {
        this.recordingProcess.kill('SIGTERM');
      }

      // 等待进程结束
      await new Promise((resolve) => {
        if (!this.recordingProcess) {
          resolve(true);
          return;
        }
        
        const checkInterval = setInterval(() => {
          if (!this.recordingProcess || this.recordingProcess.killed) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);

        // 1秒后强制结束
        setTimeout(() => {
          clearInterval(checkInterval);
          if (this.recordingProcess && !this.recordingProcess.killed) {
            this.recordingProcess.kill('SIGKILL');
          }
          resolve(true);
        }, 1000);
      });

      // 更新状态
      if (this.currentSession) {
        this.currentSession.status = 'stopped';
      }
      
      this.isRecording = false;
      this.recordingProcess = null;

      // 通知渲染进程
      if (this.mainWindow) {
        this.mainWindow.webContents.send('console-recording:stopped');
      }

      console.log('录音已停止');
      return { success: true };
    } catch (error) {
      console.error('停止录音失败:', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 清理资源
   */
  public cleanup() {
    if (this.recordingProcess && !this.recordingProcess.killed) {
      this.recordingProcess.kill('SIGKILL');
      this.recordingProcess = null;
    }
    this.isRecording = false;
    this.currentSession = null;
  }
}

// 创建并导出实例
export const consoleRecordingManager = new SimpleRecordingManager();

import { app, ipcMain, dialog, BrowserWindow, systemPreferences } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { resolveFFmpegTool } from './ffmpegResolver';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

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
  duration: number;
  outputPath: string;
  status: 'recording' | 'paused' | 'stopped' | 'completed' | 'error';
  error?: string;
}

interface AudioDevice {
  id: string;
  name: string;
  type: string;
}

class ConsoleRecordingManager {
  private isRecording = false;
  private isStartingRecording = false;
  private isStoppingRecording = false;
  private currentSession: RecordingSession | null = null;
  private recordingProcess: any = null;
  private audioDevices: AudioDevice[] = [];
  private deviceCheckInterval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;
  private lastConsoleDetectionTime = 0;
  private consoleDetectionCooldown = 30000; // 30秒冷却时间，避免重复通知

  constructor() {
    this.setupIpcHandlers();
    this.startDeviceMonitoring();
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
    // 获取音频设备列表
    ipcMain.handle('console-recording:getDevices', async () => {
      return await this.getAudioDevices();
    });

    // 检测控台话筒连接
    ipcMain.handle('console-recording:detectConsole', async () => {
      return await this.detectConsoleMicrophone();
    });

    // 开始控台录音
    ipcMain.handle('console-recording:start', async (event, options: ConsoleRecordingOptions) => {
      return await this.startRecording(options);
    });

    // 停止录音
    ipcMain.handle('console-recording:stop', async () => {
      return await this.stopRecording();
    });

    // 暂停录音
    ipcMain.handle('console-recording:pause', async () => {
      return await this.pauseRecording();
    });

    // 恢复录音
    ipcMain.handle('console-recording:resume', async () => {
      return await this.resumeRecording();
    });

    // 获取录音状态
    ipcMain.handle('console-recording:getStatus', () => {
      return this.getRecordingStatus();
    });

    // 手动检测控台话筒
    ipcMain.handle('console-recording:manualDetect', async () => {
      return await this.manualDetectConsole();
    });
  }

  /**
   * 开始设备监控
   */
  private startDeviceMonitoring() {
    // 每15秒检查一次设备状态（降低检查频率，避免性能问题）
    this.deviceCheckInterval = setInterval(async () => {
      try {
        const hasConsole = await this.detectConsoleMicrophone();
        if (hasConsole && !this.isRecording) {
          // 检查冷却时间，避免重复通知
          const now = Date.now();
          if (now - this.lastConsoleDetectionTime > this.consoleDetectionCooldown) {
            this.notifyConsoleDetected();
            this.lastConsoleDetectionTime = now;
          }
        }
      } catch (error) {
        console.error('设备监控检查失败:', error);
      }
    }, 15000); // 改为15秒
  }

  /**
   * 手动检测控台话筒
   */
  private async manualDetectConsole(): Promise<{ success: boolean; hasConsole: boolean; devices: Array<{ id: string; name: string; type: string }> }> {
    try {
      const devices = await this.getAudioDevices();
      const hasConsole = await this.detectConsoleMicrophone();
      
      return {
        success: true,
        hasConsole,
        devices
      };
    } catch (error) {
      console.error('手动检测控台话筒失败:', error);
      return {
        success: false,
        hasConsole: false,
        devices: []
      };
    }
  }

  /**
   * 获取音频设备列表
   */
  private async getAudioDevices(): Promise<Array<{ id: string; name: string; type: string }>> {
    try {
      let devices: AudioDevice[] = [];

      // macOS: 尝试确保麦克风权限，提高设备枚举与录音成功率
      if (process.platform === 'darwin') {
        try {
          const status = systemPreferences.getMediaAccessStatus('microphone');
          console.log('麦克风权限状态:', status);
          if (status === 'not-determined') {
            console.log('请求麦克风权限...');
            const granted = await systemPreferences.askForMediaAccess('microphone');
            console.log('麦克风权限授予结果:', granted);
          } else if (status === 'denied') {
            console.warn('⚠️ 麦克风权限被拒绝，录音可能失败');
          } else if (status === 'granted') {
            console.log('✅ 麦克风权限已授予');
          }
        } catch (permError) {
          console.warn('检查/请求麦克风权限失败（继续设备枚举）:', permError);
        }
      }

      // 在macOS上优先使用 ffmpeg avfoundation（之前此方式可用）
      if (process.platform === 'darwin') {
        const ffmpegDevices = await this.getMacAudioDevices();
        if (ffmpegDevices.length > 0) {
          devices = ffmpegDevices;
        } else {
        const profilerJsonDevices = await this.getMacAudioDevicesFromSystemProfiler();
          if (profilerJsonDevices.length > 0) {
            devices = profilerJsonDevices;
          } else {
        // 最后尝试 XML 解析
        const profilerXmlDevices = await this.getMacAudioDevicesFallback();
            devices = profilerXmlDevices;
          }
        }
      } else {
        // 其他平台使用ffmpeg
        devices = await this.getFFmpegAudioDevices();
      }

      this.audioDevices = devices;
      return devices;
    } catch (error) {
      console.error('获取音频设备失败:', error);
      return [];
    }
  }

  /**
   * 在macOS上获取音频设备
   */
  private async getMacAudioDevices(): Promise<Array<{ id: string; name: string; type: string }>> {
    return new Promise((resolve) => {
      // 使用ffmpeg获取avfoundation设备列表
      const ffmpegPath = this.getFFmpegPath();
      console.log('🔍 使用 FFmpeg 路径:', ffmpegPath);
      console.log('📋 FFmpeg 命令: ffmpeg -f avfoundation -list_devices true -i ""');
      
      const process = spawn(ffmpegPath, ['-f', 'avfoundation', '-list_devices', 'true', '-i', '']);
      let output = '';
      let errorOutput = '';

      // ffmpeg的设备列表输出在stderr中
      process.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.log('📤 FFmpeg stderr:', text);
      });

      process.on('error', (error) => {
        console.error('❌ FFmpeg执行失败:', error);
        console.error('🛠️ FFmpeg路径:', ffmpegPath);
        // 使用备用方法
        this.getMacAudioDevicesFallback().then(resolve);
      });

      process.on('close', (code) => {
        console.log('🏁 FFmpeg 退出码:', code);
        console.log('📝 完整 FFmpeg 输出长度:', errorOutput.length);
        // ffmpeg列出设备后会返回非0退出码，这是正常的
        if (errorOutput) {
          try {
            console.log('🔍 开始解析 FFmpeg 设备输出...');
            const devices = this.parseFFmpegMacDevices(errorOutput);
            console.log('📋 解析到的设备数量:', devices.length);
            console.log('📋 解析到的设备:', JSON.stringify(devices, null, 2));
            if (devices.length > 0) {
              resolve(devices);
            } else {
              // 如果没有找到设备，使用备用方法
              console.log('⚠️ FFmpeg 未解析到设备，尝试备用方法...');
              this.getMacAudioDevicesFallback().then(resolve);
            }
          } catch (error) {
            console.error('❌ 解析音频设备信息失败:', error);
            this.getMacAudioDevicesFallback().then(resolve);
          }
        } else {
          console.log('⚠️ FFmpeg 无输出，使用备用方法...');
          this.getMacAudioDevicesFallback().then(resolve);
        }
      });

      // 设置超时
      setTimeout(() => {
        if (!process.killed) {
          console.log('⏰ FFmpeg 命令超时，强制终止');
          process.kill('SIGTERM');
          this.getMacAudioDevicesFallback().then(resolve);
        }
      }, 5000);
    });
  }

  /**
   * 优先通过 system_profiler (JSON) 获取 macOS 音频设备（无需麦克风授权即可列出）
   */
  private async getMacAudioDevicesFromSystemProfiler(): Promise<Array<{ id: string; name: string; type: string }>> {
    return new Promise((resolve) => {
      const proc = spawn('system_profiler', ['SPAudioDataType', '-json']);
      let output = '';
      let hadError = false;

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('error', (error) => {
        console.warn('system_profiler JSON 调用失败:', error);
        hadError = true;
        resolve([]);
      });

      proc.on('close', () => {
        if (hadError || !output) return resolve([]);
        try {
          const devices = this.parseMacAudioDevicesJSON(output);
          resolve(devices);
        } catch (e) {
          console.warn('解析 system_profiler JSON 失败:', e);
          resolve([]);
        }
      });

      // 超时保护
      setTimeout(() => {
        try { proc.kill('SIGTERM'); } catch {}
        resolve([]);
      }, 5000);
    });
  }

  private parseMacAudioDevicesJSON(jsonText: string): Array<{ id: string; name: string; type: string }> {
    const devices: Array<{ id: string; name: string; type: string }> = [];
    const json = JSON.parse(jsonText);
    const list = json?.SPAudioDataType as any[];
    if (!Array.isArray(list)) return devices;

    const pushDevice = (name: string, type: string) => {
      if (!name) return;
      devices.push({ id: String(devices.length), name: name.trim(), type });
    };

    for (const item of list) {
      const devArr = item?.devices as any[];
      if (Array.isArray(devArr)) {
        for (const dev of devArr) {
          const name: string = dev?._name || dev?.name || dev?.manufacturer || '';
          const isInput: boolean = Boolean(dev?.coreaudio_device_input) || Boolean(dev?.input_devices) || String(dev?.connector)?.toLowerCase().includes('input');
          const isOutput: boolean = Boolean(dev?.coreaudio_device_output) || Boolean(dev?.output_devices) || String(dev?.connector)?.toLowerCase().includes('output');

          // 进一步通过名称关键词识别（含 蓝牙/耳机/麦克风）
          const lname = String(name).toLowerCase();
          const looksHeadphone = ['headphone','headset','earphone','earbud','airpods','bluetooth','wireless','耳机','蓝牙'].some(k=>lname.includes(k));
          const looksMic = ['microphone','mic','麦克风','话筒'].some(k=>lname.includes(k));

          if (isInput || looksMic || looksHeadphone) {
            pushDevice(name, 'input');
          } else if (isOutput) {
            pushDevice(name, 'output');
          }
        }
      }
    }

    // 去重
    const dedup: Array<{ id: string; name: string; type: string }> = [];
    const seen = new Set<string>();
    for (const d of devices) {
      const key = d.type + '|' + d.name;
      if (!seen.has(key)) {
        seen.add(key);
        dedup.push({ ...d, id: String(dedup.length) });
      }
    }
    return dedup;
  }

  /**
   * macOS备用方法获取音频设备
   */
  private async getMacAudioDevicesFallback(): Promise<Array<{ id: string; name: string; type: string }>> {
    return new Promise((resolve) => {
      const process = spawn('system_profiler', ['SPAudioDataType', '-xml']);
      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.on('error', (error) => {
        console.error('system_profiler执行失败:', error);
        resolve([
          { id: '0', name: '默认音频输入', type: 'input' },
          { id: '1', name: '内置麦克风', type: 'input' }
        ]);
      });

      process.on('close', (code) => {
        if (code === 0 && output) {
          try {
            const devices = this.parseMacAudioDevices(output);
            resolve(devices);
          } catch (error) {
            console.error('解析音频设备信息失败:', error);
            resolve([
              { id: '0', name: '默认音频输入', type: 'input' },
              { id: '1', name: '内置麦克风', type: 'input' }
            ]);
          }
        } else {
          resolve([
            { id: '0', name: '默认音频输入', type: 'input' },
            { id: '1', name: '内置麦克风', type: 'input' }
          ]);
        }
      });

      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGTERM');
          resolve([
            { id: '0', name: '默认音频输入', type: 'input' },
            { id: '1', name: '内置麦克风', type: 'input' }
          ]);
        }
      }, 5000);
    });
  }

  /**
   * 解析FFmpeg在macOS上的设备输出
   */
  private parseFFmpegMacDevices(output: string): Array<{ id: string; name: string; type: string }> {
    const devices: Array<{ id: string; name: string; type: string }> = [];
    
    try {
      console.log('🔍 原始 FFmpeg 输出:');
      console.log(output);
      console.log('🔍 输出分析开始...');
      
      // 解析AVFoundation音频设备输出
      const audioDevicesMatch = output.match(/AVFoundation audio devices:([\s\S]*?)(?=\[AVFoundation.*?video devices:|$)/i);
      
      console.log('🔍 找到音频设备部分:', !!audioDevicesMatch);
      
      if (audioDevicesMatch) {
        console.log('📝 音频设备部分内容:', audioDevicesMatch[1]);
        const lines = audioDevicesMatch[1].split('\n');
        console.log('📝 分解为行数:', lines.length);
        lines.forEach(line => {
          // 匹配形如: [AVFoundation indev @ 0x...] [0] MacBook Air麦克风
          const match = line.match(/\[AVFoundation indev @[^\]]+\]\s*\[(\d+)\]\s*(.+)/);
          if (match) {
            const id = match[1];
            const name = match[2].trim();
            console.log(`✅ 解析到设备: ID=${id}, 名称="${name}"`);
            devices.push({
              id: id,
              name: name,
              type: 'input'
            });
          } else {
            console.log(`⚠️ 行未匹配: "${line}"`);
          }
        });
      }
      // 如果未解析到，尝试简化的全文匹配
      if (devices.length === 0) {
        console.log('🔍 尝试简化解析模式...');
        // 查找所有包含音频设备的行
        const lines = output.split('\n');
        lines.forEach(line => {
          // 匹配 [AVFoundation indev @ ...] [数字] 设备名
          if (line.includes('AVFoundation audio devices:')) return;
          if (line.includes('[AVFoundation indev @') && line.includes('] [')) {
            const match = line.match(/\]\s*\[(\d+)\]\s*(.+)/);
            if (match) {
              const id = match[1];
              const name = match[2].trim();
              console.log(`✅ 简化模式解析到: ID=${id}, 名称="${name}"`);
              devices.push({ id: id, name: name, type: 'input' });
            }
          }
        });
      }
      
      console.log('🎯 最终解析结果:', devices);
    } catch (error) {
      console.error('❌ 解析FFmpeg macOS设备输出失败:', error);
    }
    
    return devices;
  }

  /**
   * 解析macOS音频设备信息
   */
  private parseMacAudioDevices(xmlOutput: string): Array<{ id: string; name: string; type: string }> {
    const devices: Array<{ id: string; name: string; type: string }> = [];
    
    try {
      // 尝试解析更多字段，兼容性更广
      const nameRegex = /<key>_name<\/key>\s*<string>([^<]+)<\/string>/g;
      const inputRegex = /<key>coreaudio_device_input<\/key>\s*<true\/>/g;
      const outputRegex = /<key>coreaudio_device_output<\/key>\s*<true\/>/g;
      const names: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = nameRegex.exec(xmlOutput)) !== null) {
        names.push(m[1]);
      }
      if (names.length) {
        names.forEach((deviceName, index) => {
          const lowerName = deviceName.toLowerCase();
          let deviceType = 'input';
          if (outputRegex.test(xmlOutput) && !inputRegex.test(xmlOutput)) {
            deviceType = 'output';
          } else if (lowerName.includes('speaker') || lowerName.includes('扬声器')) {
            deviceType = 'output';
          }
          devices.push({ id: index.toString(), name: deviceName.trim(), type: deviceType });
        });
      }

      // 如果没有找到设备，添加一些默认设备
      if (devices.length === 0) {
        devices.push(
          { id: '0', name: '默认输入设备', type: 'input' },
          { id: '1', name: '默认输出设备', type: 'output' },
          { id: '2', name: '线路输入', type: 'input' }
        );
      }
    } catch (error) {
      console.error('解析macOS音频设备XML失败:', error);
      // 返回默认设备列表
      devices.push(
        { id: '0', name: '默认输入设备', type: 'input' },
        { id: '1', name: '默认输出设备', type: 'output' },
        { id: '2', name: '线路输入', type: 'input' }
      );
    }
    
    return devices;
  }

  /**
   * 使用FFmpeg获取音频设备
   */
  private async getFFmpegAudioDevices(): Promise<Array<{ id: string; name: string; type: string }>> {
    return new Promise((resolve) => {
      const process = spawn(this.getFFmpegPath(), ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
      let output = '';
      let errorOutput = '';

      process.stderr.on('data', (data) => {
        output += data.toString();
      });

      process.stdout.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('error', (error) => {
        console.error('FFmpeg获取设备列表失败:', error);
        resolve([]);
      });

      process.on('close', (code) => {
        if (code === 0 || output) {
          const devices = this.parseFFmpegDevices(output);
          resolve(devices);
        } else {
          console.error('FFmpeg获取设备列表失败，退出码:', code);
          resolve([]);
        }
      });

      // 设置超时
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGTERM');
          resolve([]);
        }
      }, 10000);
    });
  }

  /**
   * 解析FFmpeg设备输出
   */
  private parseFFmpegDevices(output: string): Array<{ id: string; name: string; type: string }> {
    const devices: Array<{ id: string; name: string; type: string }> = [];
    
    try {
      const lines = output.split(/\r?\n/);
      const seen = new Set<string>();
      let inAudioSection = false;

      lines.forEach((line) => {
        if (/DirectShow audio devices/i.test(line)) {
          inAudioSection = true;
          return;
        }
        if (/DirectShow video devices/i.test(line)) {
          inAudioSection = false;
          return;
        }

        let deviceName: string | undefined;

        // FFmpeg 8.x DirectShow output can be: "Device Name" (audio)
        const typedDeviceMatch = line.match(/"([^"]+)"\s*\((audio|video)\)/i);
        if (typedDeviceMatch) {
          if (typedDeviceMatch[2].toLowerCase() !== 'audio') return;
          deviceName = typedDeviceMatch[1]?.trim();
        } else {
          if (!inAudioSection) return;
          deviceName = line.match(/"([^"]+)"/)?.[1]?.trim();
        }

        if (deviceName && !seen.has(deviceName)) {
          seen.add(deviceName);
          devices.push({
            id: `audio=${deviceName}`,
            name: deviceName,
            type: 'input'
          });
        }
      });

      this.audioDevices = devices;
    } catch (error) {
      console.error('解析FFmpeg设备输出失败:', error);
    }

    return devices;
  }

  private async resolveWindowsDshowAudioInput(deviceId?: string): Promise<string> {
    const rawDeviceId = (deviceId || '').trim();
    const isUsableNamedDevice = rawDeviceId
      && !/^\d+$/.test(rawDeviceId)
      && rawDeviceId.toLowerCase() !== 'default'
      && rawDeviceId.toLowerCase() !== 'audio=default';

    if (isUsableNamedDevice) {
      return rawDeviceId.startsWith('audio=') ? rawDeviceId : `audio=${rawDeviceId}`;
    }

    const cachedInput = this.audioDevices.find(device =>
      device.type === 'input'
      && device.id.startsWith('audio=')
      && device.id.toLowerCase() !== 'audio=default'
    );
    if (cachedInput) {
      console.log('使用已缓存的录音设备:', cachedInput.name);
      return cachedInput.id;
    }

    const devices = await this.getAudioDevices();
    const firstInput = devices.find(device =>
      device.type === 'input'
      && device.id.startsWith('audio=')
      && device.id.toLowerCase() !== 'audio=default'
    );

    if (firstInput) {
      console.log('未指定有效录音设备，自动选择:', firstInput.name);
      return firstInput.id;
    }

    throw new Error('未检测到可用的Windows录音设备。请确认线路输入/麦克风已连接，并在系统设置中允许应用录音。');
  }

  /**
   * 检测控台话筒连接
   */
  private async detectConsoleMicrophone(): Promise<boolean> {
    try {
      const devices = await this.getAudioDevices();
      
      // 查找可能的控台话筒设备
      const consoleDevices = devices.filter(device => {
        const name = device.name.toLowerCase();
        
        // 优先匹配专业音频设备关键词
        const professionalKeywords = [
          'console',
          'mixer',
          'audio interface',
          'sound card',
          'usb audio',
          'external mic',
          'line in',
          'xlr',
          'preamp',
          'focusrite',
          'behringer',
          'yamaha',
          'allen & heath',
          'mackie',
          'presonus',
          'steinberg',
          'roland',
          'zoom',
          'tascam'
        ];
        
        // 耳机和麦克风设备关键词（包括蓝牙和有线）
        const headphoneKeywords = [
          'headphone',
          'headset',
          'earphone',
          'earbud',
          'airpods',
          'bluetooth',
          'wireless',
          'usb headset',
          'gaming headset',
          'microphone',
          'mic',
          'boom mic',
          'condenser',
          'dynamic'
        ];
        
        // 排除内置设备
        const excludeKeywords = [
          'built-in',
          'internal',
          'system',
          'default',
          'hdmi',
          'displayport',
          'monitor',
          'speaker',
          'output'
        ];
        
        // 检查是否包含排除关键词
        const isExcluded = excludeKeywords.some(keyword => name.includes(keyword));
        if (isExcluded) return false;
        
        // 检查是否包含专业设备关键词
        const isProfessional = professionalKeywords.some(keyword => name.includes(keyword));
        if (isProfessional) return true;
        
        // 检查是否包含耳机/麦克风关键词
        const isHeadphone = headphoneKeywords.some(keyword => name.includes(keyword));
        if (isHeadphone) return true;
        
        // 检查通用外部设备关键词
        const genericKeywords = ['usb', 'external', 'input'];
        return genericKeywords.some(keyword => name.includes(keyword));
      });

      console.log('检测到的音频设备:', devices);
      console.log('可能的控台设备:', consoleDevices);

      return consoleDevices.length > 0;
    } catch (error) {
      console.error('检测控台话筒失败:', error);
      return false;
    }
  }

  /**
   * 通知渲染进程检测到控台话筒
   */
  private notifyConsoleDetected() {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        // 发送IPC消息到渲染进程
        this.mainWindow.webContents.send('console-recording:console-detected');
        console.log('已通知渲染进程检测到控台话筒连接');
      } else {
        console.log('主窗口不可用，无法发送通知');
      }
    } catch (error) {
      console.error('发送控台话筒检测通知失败:', error);
    }
  }

  private emitStopped() {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('console-recording:stopped');
      }
    } catch (e) {
      console.warn('发送停止事件失败:', e);
    }
  }

  private emitStarted(outputPath: string) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('console-recording:started', outputPath);
      }
    } catch (e) {
      console.warn('发送开始事件失败:', e);
    }
  }

  private terminateRecordingProcess(proc = this.recordingProcess, fast = false) {
    if (!proc || proc.killed || proc.exitCode !== null) return;

    try {
      if (proc.stdin && !proc.stdin.destroyed && proc.stdin.writable) {
        try {
          proc.stdin.write('q');
          proc.stdin.end();
        } catch {}
      }

      const interruptDelay = fast ? 100 : (process.platform === 'win32' ? 2500 : 800);
      const terminateDelay = fast ? 400 : (process.platform === 'win32' ? 6000 : 1600);
      const killDelay = fast ? 1000 : (process.platform === 'win32' ? 9000 : 5000);

      if (fast && proc.exitCode === null && !proc.killed) {
        try {
          proc.kill('SIGINT');
        } catch {}
      }

      setTimeout(() => {
        if (proc.exitCode === null && !proc.killed) {
          try {
            proc.kill('SIGINT');
          } catch {}
        }
      }, interruptDelay);

      setTimeout(() => {
        if (proc.exitCode === null && !proc.killed) {
          try {
            proc.kill('SIGTERM');
          } catch {}
        }
      }, terminateDelay);

      setTimeout(() => {
        if (proc.exitCode === null && !proc.killed) {
          try {
            proc.kill('SIGKILL');
          } catch {}
        }
      }, killDelay);
    } catch (error) {
      console.warn('停止FFmpeg录音进程失败:', error);
    }
  }

  private waitForRecordingProcessExit(
    proc: any,
    timeoutMs = 10000
  ): Promise<{ code: number | null; signal: NodeJS.Signals | null; timedOut: boolean }> {
    if (!proc || proc.exitCode !== null || proc.killed) {
      return Promise.resolve({
        code: typeof proc?.exitCode === 'number' ? proc.exitCode : null,
        signal: proc?.signalCode || null,
        timedOut: false
      });
    }

    return new Promise((resolve) => {
      let settled = false;
      let timeout: NodeJS.Timeout | null = null;

      const finish = (code: number | null, signal: NodeJS.Signals | null, timedOut: boolean) => {
        if (settled) return;
        settled = true;
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        try {
          proc.removeListener('close', onClose);
        } catch {}
        resolve({ code, signal, timedOut });
      };

      const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
        finish(code, signal, false);
      };

      proc.once('close', onClose);
      timeout = setTimeout(() => {
        try {
          if (proc.exitCode === null && !proc.killed) {
            proc.kill('SIGKILL');
          }
        } catch {}
        finish(
          typeof proc.exitCode === 'number' ? proc.exitCode : null,
          proc.signalCode || null,
          true
        );
      }, timeoutMs);
    });
  }

  /**
   * 开始录音
   */
  private async startRecording(options: ConsoleRecordingOptions): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    try {
      const activeProcess = this.recordingProcess && this.recordingProcess.exitCode === null;
      if (this.isStartingRecording || this.isRecording || activeProcess) {
        if (this.isStartingRecording) {
          return { success: false, error: '录音正在启动，请稍候' };
        }
        if (this.isRecording && activeProcess) {
          return { success: false, error: '录音已在进行中' };
        }
        if (this.isStoppingRecording || activeProcess) {
          return { success: false, error: '上一次录音正在结束，请稍候再试' };
        }
        // 清理陈旧状态
        this.isRecording = false;
        this.currentSession = null;
        this.recordingProcess = null;
      }

      // 创建输出目录
      await mkdir(path.dirname(options.outputPath), { recursive: true });

      // 创建录音会话
      const sessionId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.currentSession = {
        id: sessionId,
        startTime: new Date(),
        duration: 0,
        outputPath: options.outputPath,
        status: 'recording'
      };

      this.isStartingRecording = true;
      this.isStoppingRecording = false;
      this.isRecording = true;

      // 使用FFmpeg进行高质量录音
      const started = await this.startFFmpegRecording(options);
      if (!started) {
        throw new Error('录音启动失败');
      }

      this.isStartingRecording = false;

      // 通知渲染进程开始（仅发送输出路径，保持兼容）
      this.emitStarted(options.outputPath);

      return { success: true, sessionId };
    } catch (error) {
      console.error('开始录音失败:', error);
      // 复位状态
      this.isStartingRecording = false;
      this.isStoppingRecording = false;
      this.isRecording = false;
      this.currentSession = null;
      this.terminateRecordingProcess();
      this.recordingProcess = null;

      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 使用FFmpeg开始录音
   */
  private async startFFmpegRecording(options: ConsoleRecordingOptions): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      // macOS: 录音前再次检查麦克风权限
      if (process.platform === 'darwin') {
        try {
          const status = systemPreferences.getMediaAccessStatus('microphone');
          if (status === 'denied') {
            reject(new Error('麦克风权限被拒绝，请在系统偏好设置中允许应用访问麦克风'));
            return;
          } else if (status === 'not-determined') {
            console.log('录音前请求麦克风权限...');
            const granted = await systemPreferences.askForMediaAccess('microphone');
            if (!granted) {
              reject(new Error('用户拒绝了麦克风权限请求'));
              return;
            }
          }
        } catch (permError) {
          console.warn('录音前权限检查失败:', permError);
        }
      }

      let ffmpegArgs: string[];

      if (process.platform === 'darwin') {
        // macOS使用avfoundation
        // 音频设备ID格式应该是 ':数字' 例如 ':0', ':1' 等
        let audioInput = ':0'; // 默认音频输入
        if (options.deviceId) {
          // 如果是数字ID，添加冒号前缀
          if (/^\d+$/.test(options.deviceId)) {
            audioInput = ':' + options.deviceId;
          } else if (options.deviceId.startsWith(':')) {
            audioInput = options.deviceId;
          } else {
            // 对于其他格式，使用默认值
            console.warn('不支持的设备ID格式，使用默认音频设备');
            audioInput = ':0';
          }
        }
        
        // 根据输出格式构建参数
        const audioFilters = [
          `aresample=${options.sampleRate}:async=1:first_pts=0`
        ].join(',');
        const baseArgs = [
          '-hide_banner',
          '-loglevel', 'warning',
          '-thread_queue_size', '2048',
          '-use_wallclock_as_timestamps', '1',
          '-f', 'avfoundation',
          '-i', audioInput,
          '-fflags', '+genpts',
          '-af', audioFilters,
          '-ar', options.sampleRate.toString(),
          '-ac', options.channels.toString()
        ];

        // 根据输出格式添加不同的编码参数
        if (options.outputFormat === 'mp3') {
          ffmpegArgs = [
            ...baseArgs,
            '-codec:a', 'libmp3lame',
            '-b:a', '320k',
            '-y',
            options.outputPath
          ];
        } else if (options.outputFormat === 'flac') {
          ffmpegArgs = [
            ...baseArgs,
            '-codec:a', 'flac',
            '-compression_level', '8',
            '-y',
            options.outputPath
          ];
        } else {
          // WAV格式
          ffmpegArgs = [
            ...baseArgs,
            '-codec:a', 'pcm_s' + options.bitDepth + 'le',
            '-y',
            options.outputPath
          ];
        }
      } else {
        // Windows/Linux使用dshow/pulse
        const inputFormat = process.platform === 'win32' ? 'dshow' : 'pulse';
        
        // 处理Windows dshow设备ID格式
        let audioInput: string;
        try {
          audioInput = process.platform === 'win32'
            ? await this.resolveWindowsDshowAudioInput(options.deviceId)
            : (options.deviceId || 'default');
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        
        console.log('使用音频输入:', audioInput);
        
        const baseArgs = [
          '-hide_banner',
          '-loglevel', 'warning',
          '-thread_queue_size', '1024',
          ...(process.platform === 'win32' ? ['-rtbufsize', '256M', '-audio_buffer_size', '80'] : []),
          '-f', inputFormat,
          '-i', audioInput,
          '-fflags', '+genpts',
          '-af', `aresample=${options.sampleRate}:async=1:first_pts=0`,
          '-ar', options.sampleRate.toString(),
          '-ac', options.channels.toString()
        ];

        // 根据输出格式添加编码参数
        if (options.outputFormat === 'mp3') {
          ffmpegArgs = [
            ...baseArgs,
            '-codec:a', 'libmp3lame',
            '-b:a', '320k',
            '-y',
            options.outputPath
          ];
        } else if (options.outputFormat === 'flac') {
          ffmpegArgs = [
            ...baseArgs,
            '-codec:a', 'flac',
            '-compression_level', '8',
            '-y',
            options.outputPath
          ];
        } else {
          // WAV格式
          ffmpegArgs = [
            ...baseArgs,
            '-codec:a', 'pcm_s' + options.bitDepth + 'le',
            '-y',
            options.outputPath
          ];
        }
      }

      console.log('FFmpeg录音参数:', ffmpegArgs.join(' '));

      this.recordingProcess = spawn(this.getFFmpegPath(), ffmpegArgs, {
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'pipe']
      });
      const processRef = this.recordingProcess;
      let errorOutput = '';
      let hasStarted = false;
      let settled = false;
      let startupTimer: NodeJS.Timeout | null = null;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const clearStartupTimers = () => {
        if (startupTimer) {
          clearTimeout(startupTimer);
          startupTimer = null;
        }
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
      };

      const finishStartup = () => {
        if (settled || processRef.exitCode !== null) return;
        hasStarted = true;
        settled = true;
        clearStartupTimers();
        console.log('FFmpeg录音进程已稳定运行');
        resolve(true);
      };

      const failStartup = (error: Error) => {
        if (settled) return;
        settled = true;
        clearStartupTimers();
        reject(error);
      };

      // 收集stderr输出用于调试
      processRef.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        errorOutput += output;
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('device') || output.toLowerCase().includes('invalid')) {
          console.warn('FFmpeg输出:', output);
        }
        // 判断开始录音的信号
        if (!hasStarted && (output.includes('Press [q] to stop') || /size=\s*\d+/.test(output))) {
          finishStartup();
        }
      });

      processRef.on('error', (error: Error) => {
        console.error('FFmpeg录音错误:', error);
        console.error('FFmpeg错误输出:', errorOutput);
        if (this.currentSession) {
          this.currentSession.status = 'error';
          this.currentSession.error = error.message;
        }
        failStartup(error);
      });

      processRef.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        // 进程退出时，统一重置状态并通知前端
        const wasRecording = this.isRecording;
        const wasStopping = this.isStoppingRecording;
        const expectedStop = wasStopping || code === 0 || code === 255 || signal === 'SIGINT' || signal === 'SIGTERM';
        clearStartupTimers();

        if (this.currentSession) {
          this.currentSession.status = expectedStop || !wasRecording ? 'completed' : 'error';
          this.currentSession.duration = Date.now() - this.currentSession.startTime.getTime();
        }

        if (this.recordingProcess === processRef) {
          this.recordingProcess = null;
        }
        this.isStartingRecording = false;
        this.isStoppingRecording = false;

        if (wasRecording) {
          this.isRecording = false;
          this.emitStopped();
        }

        if (!settled) {
          const details = [
            `FFmpeg录音进程在启动阶段退出`,
            `退出码: ${code ?? 'null'}`,
            signal ? `信号: ${signal}` : '',
            errorOutput ? `错误输出: ${errorOutput}` : ''
          ].filter(Boolean).join('\n');
          failStartup(new Error(details));
        } else if (!expectedStop) {
          if (wasRecording && code !== null) {
            console.error('FFmpeg录音过程中异常退出，退出码:', code);
            console.error('FFmpeg错误输出:', errorOutput);
            if (this.currentSession) {
              this.currentSession.status = 'error';
              this.currentSession.error = `FFmpeg退出码: ${code}`;
            }
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('console-recording:error', {
                message: `录音过程中FFmpeg异常退出: ${code}`,
              });
            }
          }
        }
      });

      const startupDelay = process.platform === 'darwin' ? 800 : process.platform === 'win32' ? 1200 : 2000;
      startupTimer = setTimeout(() => {
        finishStartup();
      }, startupDelay);

      // 启动超时：延长到15秒，给足够时间处理权限请求
      timeoutTimer = setTimeout(() => {
        if (!settled) {
          console.error('FFmpeg启动超时');
          console.error('FFmpeg命令:', this.getFFmpegPath(), ffmpegArgs.join(' '));
          console.error('FFmpeg错误输出:', errorOutput);
          this.terminateRecordingProcess(processRef);
          failStartup(new Error(`录音启动超时 - 可能需要麦克风权限\n命令: ${ffmpegArgs.join(' ')}\n错误: ${errorOutput}`));
        }
      }, 15000);
    });
  }

  /**
   * 停止录音
   */
  private async stopRecording(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isRecording || !this.currentSession) {
        return { success: false, error: '没有正在进行的录音' };
      }

      const session = this.currentSession;
      const processRef = this.recordingProcess;
      this.isStoppingRecording = true;
      this.isStartingRecording = false;

      // 停止FFmpeg进程
      if (processRef && !processRef.killed && processRef.exitCode === null) {
        // 使用q/SIGINT/SIGTERM逐级停止录音，让FFmpeg正确关闭文件并释放麦克风
        this.terminateRecordingProcess(processRef);
        const exitResult = await this.waitForRecordingProcessExit(processRef, process.platform === 'win32' ? 12000 : 8000);
        if (exitResult.timedOut) {
          console.warn('等待FFmpeg结束超时，已强制结束录音进程');
        }
      } else {
        this.recordingProcess = null;
        this.isStoppingRecording = false;
      }

      try {
        const outputStat = await stat(session.outputPath);
        if (!outputStat.isFile() || outputStat.size <= 44) {
          throw new Error(`录音文件未正确写入或为空: ${session.outputPath}`);
        }
      } catch (fileError) {
        if (session) {
          session.status = 'error';
          session.error = fileError instanceof Error ? fileError.message : String(fileError);
        }
        this.isRecording = false;
        this.isStoppingRecording = false;
        if (this.recordingProcess === processRef) {
          this.recordingProcess = null;
        }
        const message = fileError instanceof Error ? fileError.message : '录音文件保存失败';
        console.error('录音文件校验失败:', fileError);
        return { success: false, error: message };
      }

      // 更新会话状态
      if (this.currentSession) {
        this.currentSession.status = 'completed';
        this.currentSession.duration = Date.now() - this.currentSession.startTime.getTime();
      }

      this.isRecording = false;
      this.isStoppingRecording = false;
      if (this.recordingProcess === processRef) {
        this.recordingProcess = null;
      }

      if (this.isRecording) {
        this.emitStopped();
      }

      return { success: true };
    } catch (error) {
      console.error('停止录音失败:', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 暂停录音
   */
  private async pauseRecording(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isRecording || !this.currentSession) {
        return { success: false, error: '没有正在进行的录音' };
      }

      // 暂停FFmpeg进程
      if (this.recordingProcess && !this.recordingProcess.killed) {
        if (process.platform === 'win32') {
          // Windows不支持SIGSTOP，需要停止并重新开始录音
          // 这里可以考虑停止录音并记录位置，或者使用其他方法
          console.warn('Windows平台暂不支持暂停录音功能');
          return { success: false, error: 'Windows平台暂不支持暂停功能' };
        } else {
          // macOS/Linux使用SIGSTOP
          this.recordingProcess.kill('SIGSTOP');
        }
      }

      if (this.currentSession) {
        this.currentSession.status = 'paused';
      }

      return { success: true };
    } catch (error) {
      console.error('暂停录音失败:', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 恢复录音
   */
  private async resumeRecording(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.currentSession || this.currentSession.status !== 'paused') {
        return { success: false, error: '没有暂停的录音' };
      }

      // 恢复FFmpeg进程
      if (this.recordingProcess && !this.recordingProcess.killed) {
        if (process.platform === 'win32') {
          // Windows不支持SIGCONT，暂不支持恢复功能
          console.warn('Windows平台暂不支持恢复录音功能');
          return { success: false, error: 'Windows平台暂不支持恢复功能' };
        } else {
          // macOS/Linux使用SIGCONT
          this.recordingProcess.kill('SIGCONT');
        }
      }

      if (this.currentSession) {
        this.currentSession.status = 'recording';
      }

      this.isRecording = true;

      return { success: true };
    } catch (error) {
      console.error('恢复录音失败:', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 获取录音状态
   */
  private getRecordingStatus(): { isRecording: boolean; isStarting: boolean; isStopping: boolean; session: RecordingSession | null } {
    return {
      isRecording: this.isRecording,
      isStarting: this.isStartingRecording,
      isStopping: this.isStoppingRecording,
      session: this.currentSession
    };
  }

  /**
   * 清理资源
   */
  public cleanup() {
    // 清理设备检查定时器
    if (this.deviceCheckInterval) {
      clearInterval(this.deviceCheckInterval);
      this.deviceCheckInterval = null;
    }
    
    // 退出应用时必须停止FFmpeg，确保macOS麦克风占用能释放
    const proc = this.recordingProcess;
    if (proc && !proc.killed && proc.exitCode === null) {
      this.isStoppingRecording = true;
      this.terminateRecordingProcess(proc, true);
      setTimeout(() => {
        if (this.recordingProcess === proc) {
          this.recordingProcess = null;
        }
        this.isStoppingRecording = false;
      }, 1200);
    } else {
      this.recordingProcess = null;
      this.isStoppingRecording = false;
    }
    
    // 重置状态
    this.isStartingRecording = false;
    this.isRecording = false;
    this.currentSession = null;
  }

  private getFFmpegPath(): string {
    return resolveFFmpegTool('ffmpeg');
  }
}

// 创建单例实例
export const consoleRecordingManager = new ConsoleRecordingManager();

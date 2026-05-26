import { app, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { MusicDecryptor } from './musicDecryptor';
import { resolveFFmpegTool } from './ffmpegResolver';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);

interface ConvertOptions {
  inputPath?: string;
  inputData?: Uint8Array;
  inputFormat?: string;
  inputName?: string;
  outputPath: string;
  format: 'mp3' | 'wav' | 'flac' | 'm4a' | 'aac' | 'ogg';
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
}

interface ConversionProgress {
  percent: number;
  time: string;
  speed: string;
}

class FFmpegManager {
  private ffmpegPath: string;
  private conversions: Map<string, any> = new Map();

  constructor() {
    // 根据平台设置FFmpeg路径
    this.ffmpegPath = this.getFFmpegPath();
    this.setupIpcHandlers();
  }

  /**
   * 检测是否为加密文件
   */
  private isEncryptedFile(data: Uint8Array): boolean {
    if (data.length < 8) return false;
    
    // 检测 NCM 文件头 (CTENFDAM)
    if (data[0] === 0x43 && data[1] === 0x54 && data[2] === 0x45 && data[3] === 0x4E &&
        data[4] === 0x46 && data[5] === 0x44 && data[6] === 0x41 && data[7] === 0x4D) {
      return true;
    }
    
    // 检测 KGM 文件头 (0x7C 0xD5 0x32 0xEB...)
    if (data.length >= 4 && data[0] === 0x7C && data[1] === 0xD5 && data[2] === 0x32 && data[3] === 0xEB) {
      return true;
    }
    
    return false;
  }

  private getFFmpegPath(): string {
    return resolveFFmpegTool('ffmpeg');
  }

  private getFFprobePath(): string {
    return resolveFFmpegTool('ffprobe');
  }

  private setupIpcHandlers() {
    console.log('设置FFmpeg IPC处理器...');
    
    // 检查FFmpeg是否可用
    ipcMain.handle('ffmpeg:check', async () => {
      console.log('ffmpeg:check 被调用');
      try {
        const result = await this.checkFFmpeg();
        console.log('FFmpeg检查结果:', result);
        return result;
      } catch (error) {
        console.error('FFmpeg检查失败:', error);
        return false;
      }
    });

    // 转换音频文件
    ipcMain.handle('ffmpeg:convert', async (event, options: any) => {
      console.log('ffmpeg:convert 被调用，选项:', options);
      console.log('options.inputData 存在:', !!options.inputData);
      console.log('options.inputPath 存在:', !!options.inputPath);
      
      if (options.inputData) {
        console.log('inputData 长度:', options.inputData.length || options.inputData.byteLength);
        console.log('inputData 前8字节:', Array.from(new Uint8Array(options.inputData).slice(0, 8)));
      }
      
      try {
        let convertOptions: ConvertOptions;
        let decryptedResult: DecryptResult | null = null;
        
        // 如果传入的是 inputData，需要先写入临时文件
        if (options.inputData) {
          const tempDir = path.join(app.getPath('temp'), 'ffmpeg-convert');
          if (!fs.existsSync(tempDir)) {
            await mkdir(tempDir, { recursive: true });
          }
          
          let actualInputPath: string;
          const tempOutputPath = path.join(tempDir, `output_${Date.now()}.${options.outputFormat || 'mp3'}`);
          
          // 检查文件是否需要解密（直接检查 inputData）
          const inputData = new Uint8Array(options.inputData);
          const requestedInputFormat = typeof options.inputFormat === 'string' ? options.inputFormat.toLowerCase() : '';
          const forcedDecryptFormat =
            requestedInputFormat === 'ncm' ? 'ncm' :
            ['kgm', 'kgg', 'vpr'].includes(requestedInputFormat) ? 'kgm' :
            'auto';
          const shouldDecryptInput = this.isEncryptedFile(inputData) || forcedDecryptFormat !== 'auto';

          if (shouldDecryptInput) {
            console.log('检测到加密文件，开始解密...');
            try {
              const decryptor = new MusicDecryptor(false); // 不设置 IPC 处理器
              
              const decryptResult = await decryptor.decryptMusic({
                inputData,
                format: forcedDecryptFormat as 'auto' | 'ncm' | 'kgm'
              });
              
              if (decryptResult.success && decryptResult.outputData) {
                decryptedResult = decryptResult;
                console.log('解密成功，格式:', decryptResult.format);
                console.log('解密后数据长度:', decryptResult.outputData.length);
                console.log('解密后数据前16字节:', Array.from(decryptResult.outputData.slice(0, 16)));
                
                // 写入解密后的数据到临时文件
                const decryptedPath = path.join(tempDir, `decrypted_${Date.now()}.${decryptResult.format}`);
                const decryptedBuffer = Buffer.from(decryptResult.outputData);
                
                console.log('写入解密文件:', decryptedPath);
                await writeFile(decryptedPath, decryptedBuffer);
                
                // 验证文件写入成功
                const stats = fs.statSync(decryptedPath);
                console.log('解密文件大小:', stats.size);
                
                if (stats.size === 0) {
                  throw new Error('解密文件写入失败：文件大小为0');
                }
                
                // 等待文件系统同步
                await new Promise(resolve => setTimeout(resolve, 100));
                
                actualInputPath = decryptedPath;
              } else {
                throw new Error(decryptResult.error || '解密失败');
              }
            } catch (decryptError) {
              console.error('解密失败:', decryptError);
              // 加密文件解密失败时不要再按普通音频直接转换
              const decryptLabel = forcedDecryptFormat === 'ncm' ? 'NCM' : 'KGM';
              throw new Error(`${decryptLabel} 解密失败，文件可能不是有效的加密音乐文件，或当前版本暂不支持这种加密方式`);
            }
          } else {
            // 不是加密文件，直接写入临时文件
            const inputExt = requestedInputFormat || 'tmp';
            const tempInputPath = path.join(tempDir, `input_${Date.now()}.${inputExt}`);
            await writeFile(tempInputPath, Buffer.from(inputData));
            actualInputPath = tempInputPath;
          }
          
          convertOptions = {
            inputPath: actualInputPath,
            inputFormat: requestedInputFormat,
            inputName: options.inputName,
            outputPath: tempOutputPath,
            format: options.outputFormat || 'mp3',
            bitrate: options.bitrate,
            sampleRate: options.sampleRate,
            channels: options.channels
          };
        } else {
          convertOptions = options as ConvertOptions;
        }
        
        const result = await this.convertAudio(convertOptions, (progress) => {
          console.log('转换进度:', progress);
          event.sender.send('ffmpeg:progress', progress);
        });

        const targetFormat = (options.outputFormat || 'mp3').toLowerCase();
        const decryptedFormat = (decryptedResult?.format || 'mp3').toLowerCase();

        if (options.inputData && !result.success && decryptedResult?.outputData && decryptedFormat == targetFormat) {
          console.warn('FFmpeg????????????????????');

          try {
            if (convertOptions.inputPath) await unlink(convertOptions.inputPath);
            if (convertOptions.outputPath) await unlink(convertOptions.outputPath);
          } catch (cleanupError) {
            console.warn('???????????:', cleanupError);
          }

          return {
            success: true,
            data: Buffer.from(decryptedResult.outputData)
          };
        }
        
        // 如果使用了临时文件，读取输出并返回数据
        if (options.inputData && result.success && result.outputPath) {
          try {
            const outputData = await readFile(result.outputPath);
            result.data = outputData;
            
            // 清理临时文件
            try {
              if (convertOptions.inputPath) await unlink(convertOptions.inputPath);
              if (result.outputPath) await unlink(result.outputPath);
            } catch (cleanupError) {
              console.warn('清理临时文件失败:', cleanupError);
            }
          } catch (readError) {
            console.error('读取输出文件失败:', readError);
          }
        }
        
        return result;
      } catch (error) {
        console.error('FFmpeg转换失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : '转换失败'
        };
      }
    });

    // 取消转换
    ipcMain.handle('ffmpeg:cancel', async (event, conversionId: string) => {
      console.log('ffmpeg:cancel 被调用，ID:', conversionId);
      try {
        return this.cancelConversion(conversionId);
      } catch (error) {
        console.error('取消转换失败:', error);
        return false;
      }
    });

    // 获取音频信息
    ipcMain.handle('ffmpeg:getInfo', async (event, filePath: string) => {
      console.log('ffmpeg:getInfo 被调用，文件:', filePath);
      try {
        return await this.getAudioInfo(filePath);
      } catch (error) {
        console.error('获取音频信息失败:', error);
        throw error;
      }
    });
    
    console.log('FFmpeg IPC处理器设置完成');
  }

  async checkFFmpeg(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpeg = spawn(this.ffmpegPath, ['-version']);
      
      ffmpeg.on('error', () => {
        console.error('FFmpeg not found');
        resolve(false);
      });
      
      ffmpeg.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  async convertAudio(
    options: ConvertOptions,
    onProgress?: (progress: ConversionProgress) => void
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    const conversionId = Date.now().toString();
    
    return new Promise((resolve) => {
      const args = this.buildFFmpegArgs(options);
      
      console.log('Starting FFmpeg with args:', args.join(' '));
      
      const ffmpeg = spawn(this.ffmpegPath, args);
      this.conversions.set(conversionId, ffmpeg);
      
      let stderr = '';
      let duration = 0;
      let hasProgress = false;
      
      // 设置超时机制，防止进程卡死
      const timeout = setTimeout(() => {
        console.error('FFmpeg转换超时');
        ffmpeg.kill('SIGTERM');
        this.conversions.delete(conversionId);
        resolve({
          success: false,
          error: '转换超时'
        });
      }, 300000); // 5分钟超时
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        
        // 解析持续时间
        const durationMatch = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
        if (durationMatch && duration === 0) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseInt(durationMatch[3]);
          duration = hours * 3600 + minutes * 60 + seconds;
        }
        
        // 解析进度
        const progressMatch = stderr.match(/time=(\d{2}):(\d{2}):(\d{2}).*speed=(\S+)/);
        if (progressMatch && duration > 0) {
          const hours = parseInt(progressMatch[1]);
          const minutes = parseInt(progressMatch[2]);
          const seconds = parseInt(progressMatch[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          const percent = Math.min(100, Math.round((currentTime / duration) * 100));
          
          hasProgress = true;
          
          if (onProgress) {
            try {
              onProgress({
                percent,
                time: `${progressMatch[1]}:${progressMatch[2]}:${progressMatch[3]}`,
                speed: progressMatch[4]
              });
            } catch (error) {
              console.error('进度回调错误:', error);
            }
          }
        }
      });
      
      ffmpeg.on('error', (error) => {
        console.error('FFmpeg error:', error);
        clearTimeout(timeout);
        this.conversions.delete(conversionId);
        resolve({
          success: false,
          error: error.message
        });
      });
      
      ffmpeg.on('close', (code) => {
        clearTimeout(timeout);
        this.conversions.delete(conversionId);
        
        console.log(`FFmpeg转换完成，退出代码: ${code}`);
        console.log(`输入文件路径: ${options.inputPath}`);
        console.log(`输出文件路径: ${options.outputPath}`);
        
        if (code === 0) {
          console.log('FFmpeg转换成功');
          
          // 验证输出文件是否真的存在且有内容 - 增加重试机制
          const verifyFile = async () => {
            let retryCount = 0;
            const maxRetries = 5;
            
            while (retryCount < maxRetries) {
              try {
                // 等待文件系统同步
                await new Promise(resolve => setTimeout(resolve, 100 * (retryCount + 1)));
                
                const stat = fs.statSync(options.outputPath);
                if (stat.size > 0) {
                  console.log(`输出文件验证成功: ${options.outputPath} (${stat.size} bytes)`);
                  return { success: true, outputPath: options.outputPath };
                } else {
                  console.log(`文件大小为0，第 ${retryCount + 1} 次重试...`);
                }
              } catch (statError) {
                console.log(`文件不存在，第 ${retryCount + 1} 次重试...`, statError);
              }
              retryCount++;
            }
            
            console.error('文件验证失败，已重试', maxRetries, '次');
            console.error('FFmpeg stderr 输出:', stderr);
            return {
              success: false,
              error: `转换完成但输出文件验证失败。FFmpeg stderr: ${stderr.slice(-500)}`
            };
          };
          
          verifyFile().then(result => resolve(result));
        } else {
          // 提供更详细的错误信息
          let errorMessage = `FFmpeg exited with code ${code}`;
          if (stderr) {
            const errorMatch = stderr.match(/error|Error|ERROR/);
            if (errorMatch) {
              errorMessage += `: ${stderr.slice(-200)}`; // 取最后200个字符
            }
          }
          
          console.error('FFmpeg转换失败:', errorMessage);
          console.error('FFmpeg完整 stderr:', stderr);
          
          resolve({
            success: false,
            error: errorMessage
          });
        }
      });
    });
  }

  private buildFFmpegArgs(options: ConvertOptions): string[] {
    const inputExt = options.inputPath
      ? path.extname(options.inputPath).toLowerCase().replace('.', '')
      : '';
    const supportedInputFormats = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg']);

    const args = [
      '-analyzeduration', '20000000',
      '-probesize', '50000000',
      '-fflags', '+genpts+discardcorrupt',
      '-err_detect', 'ignore_err'
    ];

    if (supportedInputFormats.has(inputExt)) {
      args.push('-f', inputExt);
    }

    args.push(
      '-i', options.inputPath,
      '-y'
    );

    switch (options.format) {
      case 'mp3':
        args.push('-codec:a', 'libmp3lame');
        if (options.bitrate) {
          args.push('-b:a', `${options.bitrate}k`);
        }
        break;
        
      case 'wav':
        args.push('-codec:a', 'pcm_s16le');
        break;
        
      case 'flac':
        args.push('-codec:a', 'flac');
        if (options.bitrate) {
          args.push('-compression_level', '5');
        }
        break;
        
      case 'm4a':
        args.push('-codec:a', 'aac');
        args.push('-movflags', '+faststart');
        if (options.bitrate) {
          args.push('-b:a', `${options.bitrate}k`);
        } else {
          args.push('-b:a', '256k');
        }
        break;
        
      case 'aac':
        args.push('-codec:a', 'aac');
        if (options.bitrate) {
          args.push('-b:a', `${options.bitrate}k`);
        }
        break;
        
      case 'ogg':
        args.push('-codec:a', 'libvorbis');
        if (options.bitrate) {
          args.push('-b:a', `${options.bitrate}k`);
        }
        break;
    }
    
    if (options.sampleRate) {
      args.push('-ar', options.sampleRate.toString());
    }
    
    if (options.channels) {
      args.push('-ac', options.channels.toString());
    }
    
    args.push(options.outputPath);
    
    return args;
  }

  cancelConversion(conversionId: string): boolean {
    const ffmpeg = this.conversions.get(conversionId);
    if (ffmpeg) {
      ffmpeg.kill('SIGTERM');
      this.conversions.delete(conversionId);
      return true;
    }
    return false;
  }

  async getAudioInfo(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', filePath,
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams'
      ];
      
      const ffprobePath = this.getFFprobePath();
      const ffprobe = spawn(ffprobePath, args);
      let stdout = '';
      let stderr = '';
      
      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffprobe.on('error', (error) => {
        reject(error);
      });
      
      ffprobe.on('close', (code) => {
        if (code === 0) {
          try {
            const info = JSON.parse(stdout);
            resolve(info);
          } catch (error) {
            reject(new Error('Failed to parse audio info'));
          }
        } else {
          reject(new Error(stderr || `ffprobe exited with code ${code}`));
        }
      });
    });
  }
}

// 导出类
export { FFmpegManager };

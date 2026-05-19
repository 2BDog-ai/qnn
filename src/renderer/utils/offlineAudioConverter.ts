// 离线音频转换工具类 - 使用Electron主进程的FFmpeg
// 解密功能已禁用
// import { MusicDecryptorFactory, decryptMusicFile, DecryptResult } from './musicDecryptor';

export interface ConvertOptions {
  format: 'mp3' | 'wav' | 'flac' | 'm4a' | 'aac' | 'ogg';
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  quality?: 'low' | 'medium' | 'high';
  // 解密相关选项已禁用
  // enableDecryption?: boolean;
}

export interface ConversionProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status: 'waiting' | 'converting' | 'completed' | 'error';
  error?: string;
  startTime?: Date;
  estimatedTime?: number;
  currentStep?: string;
}

export interface ConversionResult {
  fileId: string;
  fileName: string;
  originalFormat: string;
  targetFormat: string;
  originalSize: number;
  convertedSize: number;
  duration: number;
  success: boolean;
  error?: string;
  outputPath?: string;
  convertedData?: Blob;
}

export class OfflineAudioConverter {
  private conversions: Map<string, ConversionProgress> = new Map();
  private isConverting = false;
  private conversionQueue: Array<{
    file: File;
    options: ConvertOptions | null;
    fileId: string;
    outputDirectory?: string | null;
  }> = [];
  private ffmpegCheckPromise: Promise<void> | null = null;
  private hasCheckedFFmpeg = false;
  private isFFmpegAvailable = false;
  private useWebAudioAPI = false; // 备用方案标志
  private globalOptions?: ConvertOptions; // 全局转换选项
  private globalOutputDirectory?: string; // 全局输出目录

  constructor() {
    // 异步检查FFmpeg可用性，但不等待结果
    this.ffmpegCheckPromise = this.checkFFmpegAvailability().catch(error => {
      console.error('初始化FFmpeg检查失败:', error);
    }).finally(() => {
      this.hasCheckedFFmpeg = true;
      this.ffmpegCheckPromise = null;
    });
  }

  /**
   * 检查FFmpeg是否可用
   */
  private async checkFFmpegAvailability() {
    try {
      // 检查是否在Electron环境中
      if (window.electronAPI?.ffmpeg?.check) {
        this.isFFmpegAvailable = await window.electronAPI.ffmpeg.check();
        console.log('FFmpeg可用性:', this.isFFmpegAvailable);
      } else {
        // 不在Electron环境中，使用Web Audio API作为备用
        this.useWebAudioAPI = true;
        console.log('使用Web Audio API作为备用方案');
      }
    } catch (error) {
      console.error('检查FFmpeg失败:', error);
      this.useWebAudioAPI = true;
    }
  }

  /**
   * 获取FFmpeg状态
   */
  getFFmpegStatus(): 'loading' | 'ready' | 'error' | 'fallback' {
    if (!this.hasCheckedFFmpeg && !this.useWebAudioAPI && !this.isFFmpegAvailable) return 'loading';
    if (this.useWebAudioAPI) return 'fallback';
    if (this.isFFmpegAvailable) return 'ready';
    return 'error';
  }

  private async waitForFFmpegCheck(): Promise<void> {
    if (this.ffmpegCheckPromise) {
      await this.ffmpegCheckPromise;
    }
  }

  private isEncryptedAudioFile(file: File): boolean {
    const ext = this.getFileExtension(file.name);
    return ['ncm', 'kgm', 'kgg', 'vpr'].includes(ext);
  }

  private getEncryptedFormatLabel(file: File): string {
    const ext = this.getFileExtension(file.name);
    if (ext === 'ncm') return 'NCM';
    if (ext === 'kgm' || ext === 'kgg' || ext === 'vpr') return 'KGM';
    return ext.toUpperCase();
  }

  private toReadableError(error: unknown, file?: File): string {
    const message = error instanceof Error ? error.message : String(error || '');
    if (file && this.isEncryptedAudioFile(file)) {
      return `${this.getEncryptedFormatLabel(file)} 解密失败，文件可能不是有效的加密音乐文件，或当前版本暂不支持这种加密方式`;
    }
    if (message.includes('decodeAudioData')) {
      return '浏览器无法直接解码这个音频文件，请使用 FFmpeg 转换或更换有效音频文件';
    }
    return message || '转换失败';
  }

  /**
   * 添加文件到转换队列
   */
  addToQueue(file: File, options: ConvertOptions | null, outputDirectory?: string): string {
    const fileId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 添加到队列，options 和 outputDirectory 都为 null，在转换时使用最新设置
    this.conversionQueue.push({ file, options: options || null, fileId, outputDirectory: null });
    
    // 初始化进度
    this.conversions.set(fileId, {
      fileId,
      fileName: file.name,
      progress: 0,
      status: 'waiting'
    });

    return fileId;
  }

  /**
   * 开始转换队列中的所有文件
   */
  async startConversion(globalOptions?: ConvertOptions, globalOutputDirectory?: string): Promise<void> {
    try {
      console.log('startConversion被调用');
      console.log('当前转换状态:', this.isConverting);
      console.log('队列长度:', this.conversionQueue.length);
      console.log('全局选项:', globalOptions);
      console.log('全局输出目录:', globalOutputDirectory);
      
      // 保存全局选项供转换时使用
      this.globalOptions = globalOptions;
      this.globalOutputDirectory = globalOutputDirectory;
      
      if (!this.isConverting && this.conversionQueue.length > 0) {
        console.log('开始处理转换队列');
        this.isConverting = true;
        
        // 使用requestAnimationFrame确保UI不会阻塞
        requestAnimationFrame(async () => {
          try {
            await this.processQueue();
            this.isConverting = false;
            console.log('转换队列处理完成');
          } catch (error) {
            console.error('处理队列时发生错误:', error);
            this.isConverting = false;
            this.handleConversionError(error);
          }
        });
      } else {
        console.log('跳过转换：isConverting=', this.isConverting, 'queueLength=', this.conversionQueue.length);
      }
    } catch (error) {
      console.error('转换过程中发生错误:', error);
      this.isConverting = false;
      this.handleConversionError(error);
    }
  }

  /**
   * 处理转换错误，防止白屏
   */
  private handleConversionError(error: any): void {
    console.error('处理转换错误:', error);
    
    // 增强错误处理，防止白屏
    if (error instanceof Error) {
      console.error('错误详情:', error.message);
      console.error('错误堆栈:', error.stack);
    }
    
    // 标记所有正在转换的文件为错误状态
    this.conversions.forEach((conv, key) => {
      if (conv.status === 'converting') {
        conv.status = 'error';
        conv.error = error instanceof Error ? error.message : '转换失败';
        conv.currentStep = '转换失败';
        
        // 强制UI更新
        this.updateProgressUI(key, conv.progress);
      }
    });
    
    // 触发错误事件，通知UI更新
    window.dispatchEvent(new CustomEvent('conversionError', {
      detail: { error: error instanceof Error ? error.message : '转换失败' }
    }));
    
    // 不重新抛出错误，而是记录并继续
    console.error('转换失败，但应用继续运行');
  }

  /**
   * 处理转换队列
   */
  private async processQueue(): Promise<void> {
    console.log('processQueue开始执行');
    console.log('FFmpeg可用:', this.isFFmpegAvailable);
    console.log('使用Web Audio API:', this.useWebAudioAPI);
    
    await this.waitForFFmpegCheck();

    while (this.conversionQueue.length > 0) {
      const item = this.conversionQueue.shift();
      if (item) {
        console.log('处理文件:', item.file.name);
        try {
          // 检查转换是否被取消
          const conversion = this.conversions.get(item.fileId);
          if (!conversion || conversion.status === 'error') {
            console.log('跳过已取消或错误的文件:', item.file.name);
            continue;
          }

          // 始终使用全局选项和全局输出目录
          const finalOptions = item.options || this.globalOptions;
          const finalOutputDirectory = this.globalOutputDirectory; // 始终使用全局输出目录
          
          if (!finalOptions) {
            console.error('没有可用的转换选项');
            conversion.status = 'error';
            conversion.error = '没有可用的转换选项';
            continue;
          }
          
          console.log('使用转换选项:', finalOptions);
          console.log('使用输出目录:', finalOutputDirectory);

          // 解密功能已禁用，直接处理原文件
          const processedFile = item.file;
          const encryptedFile = this.isEncryptedAudioFile(processedFile);

          if (encryptedFile || (this.isFFmpegAvailable && !this.useWebAudioAPI)) {
            console.log('使用FFmpeg转换');
            await this.convertWithFFmpeg(processedFile, finalOptions, item.fileId, finalOutputDirectory);
          } else {
            console.log('使用Web Audio API转换');
            await this.convertWithWebAudio(processedFile, finalOptions, item.fileId, finalOutputDirectory);
          }
        } catch (error) {
          console.error(`转换文件 ${item.file.name} 失败:`, error);
          
          // 更新转换状态为错误
          const conversion = this.conversions.get(item.fileId);
          if (conversion) {
            conversion.status = 'error';
            conversion.error = error instanceof Error ? error.message : '转换失败';
            conversion.currentStep = '转换失败';
          }
          
          // 继续处理下一个文件，而不是中断整个队列
          console.log('继续处理下一个文件...');
        }
        
        // 添加小延迟，让UI有机会更新
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    console.log('processQueue执行完成');
  }

  /**
   * 使用FFmpeg转换音频（通过Electron主进程）
   */
  private async convertWithFFmpeg(file: File, options: ConvertOptions, fileId: string, outputDirectory?: string): Promise<void> {
    console.log('convertWithFFmpeg开始执行');
    console.log('文件信息:', {
      name: file.name,
      size: file.size,
      type: file.type,
      format: options.format,
      outputDirectory
    });
    
    // 特殊调试：对于问题文件添加详细日志
    const isProblematicFile = file.name.includes('C20000350Q7m2fNEtA');
    if (isProblematicFile) {
      console.log('🔍 检测到问题文件，启用详细调试:', file.name);
    }
    
    const conversion = this.conversions.get(fileId);
    if (!conversion) {
      console.log('未找到转换记录，退出');
      return;
    }
    const encryptedFile = this.isEncryptedAudioFile(file);

    try {
      // 检查FFmpeg API是否可用
      if (!window.electronAPI?.ffmpeg?.convert) {
        if (encryptedFile) {
          throw new Error(`${this.getEncryptedFormatLabel(file)} 文件需要主程序解密转换，当前转换服务不可用`);
        }
        console.log('FFmpeg API不可用，回退到Web Audio API');
        await this.convertWithWebAudio(file, options, fileId);
        return;
      }

      console.log('FFmpeg API可用，开始转换');
      // 更新状态
      conversion.status = 'converting';
      conversion.currentStep = '准备转换...';
      conversion.startTime = new Date();

      // 创建临时文件路径
      const tempDir = await this.getTempDir();
      const inputPath = `${tempDir}/input_${fileId}.${this.getFileExtension(file.name)}`;
      const outputPath = `${tempDir}/output_${fileId}.${options.format}`;

      // 保存输入文件到临时目录
      conversion.currentStep = '保存输入文件...';
      conversion.progress = 5;
      await this.saveFileToTemp(file, inputPath);

      // 设置进度监听
      let progressListener: ((progress: any) => void) | null = null;
      if (window.electronAPI?.ffmpeg?.onProgress) {
        progressListener = (progress: any) => {
          if (conversion && conversion.status === 'converting') {
            // 确保进度在合理范围内，避免白屏
            const safeProgress = Math.min(95, Math.max(5, progress.percent || 0));
            conversion.progress = safeProgress;
            conversion.currentStep = `转换中 ${safeProgress}% (${progress.speed || '未知速度'})`;
            
            // 立即触发UI更新事件，避免requestAnimationFrame造成的延迟
            try {
              window.dispatchEvent(new CustomEvent('conversionProgress', {
                detail: { fileId, progress: safeProgress }
              }));
            } catch (error) {
              console.warn('UI更新事件触发失败:', error);
            }
          }
        };
        window.electronAPI.ffmpeg.onProgress(progressListener);
      }

      // 调用Electron主进程进行转换
      conversion.currentStep = '开始转换...';
      conversion.progress = 10;
      
      // 读取文件数据
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      console.log('文件数据已读取，大小:', uint8Array.length);
      console.log('文件前8字节:', Array.from(uint8Array.slice(0, 8)));
      
      const result = await window.electronAPI.ffmpeg.convert({
        inputData: uint8Array,  // 传递数据而不是路径
        inputFormat: this.getFileExtension(file.name),
        inputName: file.name,
        outputFormat: options.format,
        bitrate: options.bitrate || this.getDefaultBitrate(options.format),
        sampleRate: options.sampleRate || 44100,
        channels: options.channels || 2
      });

      if (result && result.success) {
        // 从结果中获取转换后的数据
        conversion.currentStep = '处理转换结果...';
        conversion.progress = 90;
        
        let convertedData: Blob;
        if (result.data) {
          // 数据已经在结果中
          convertedData = new Blob([result.data], {
            type: this.getMimeType(options.format)
          });
        } else {
          throw new Error('转换结果中没有数据');
        }
        
        conversion.status = 'completed';
        conversion.progress = 100;
        conversion.currentStep = '转换完成';
        
        // 保存结果
        this.storeConversionResult(fileId, convertedData, options.format);
        
        // 自动保存到用户选择的输出目录
        if (outputDirectory) {
          try {
            const outputFileName = conversion.fileName.replace(/\.[^/.]+$/, `.${options.format}`);
            const finalOutputPath = `${outputDirectory}/${outputFileName}`;
            
            console.log(`准备保存文件: ${finalOutputPath}`);
            console.log(`文件格式: ${options.format}`);
            console.log(`转换数据大小: ${convertedData.size} bytes`);
            
            // 检查文件系统API是否可用
            if (window.electronAPI?.fs?.writeFile) {
              // 检查目录是否存在
              if (window.electronAPI?.fs?.exists) {
                const dirExists = await window.electronAPI.fs.exists(outputDirectory);
                if (!dirExists) {
                  console.log(`目录不存在，创建目录: ${outputDirectory}`);
                  await window.electronAPI.fs.mkdir(outputDirectory);
                }
              }
              
              const buffer = await convertedData.arrayBuffer();
              console.log(`准备写入文件，缓冲区大小: ${buffer.byteLength} bytes`);
              
              await window.electronAPI.fs.writeFile(finalOutputPath, buffer);
              console.log(`✅ 文件成功保存到: ${finalOutputPath}`);
              
              // 验证文件是否确实被保存 - 增加重试机制和文件大小检查
              if (window.electronAPI?.fs?.exists && window.electronAPI?.fs?.readFile) {
                let fileExists = false;
                let fileSizeValid = false;
                let retryCount = 0;
                const maxRetries = 5;
                
                while ((!fileExists || !fileSizeValid) && retryCount < maxRetries) {
                  // 每次重试前等待更长时间
                  await new Promise(resolve => setTimeout(resolve, 300 * (retryCount + 1)));
                  
                  try {
                    fileExists = await window.electronAPI.fs.exists(finalOutputPath);
                    
                    if (fileExists) {
                      // 检查文件大小
                      const fileData = await window.electronAPI.fs.readFile(finalOutputPath);
                      const fileSize = fileData.byteLength;
                      fileSizeValid = fileSize > 100; // 至少100字节
                      
                      console.log(`文件验证 - 存在: ${fileExists}, 大小: ${fileSize} bytes, 有效: ${fileSizeValid}`);
                      
                      if (fileSizeValid) {
                        console.log(`✅ 文件验证成功: ${finalOutputPath} (${fileSize} bytes)`);
                        break;
                      }
                    }
                  } catch (verifyError) {
                    console.log(`文件验证异常，第 ${retryCount + 1} 次重试:`, verifyError);
                  }
                  
                  retryCount++;
                  console.log(`文件验证失败，第 ${retryCount} 次重试...`);
                }
                
                if (!fileExists || !fileSizeValid) {
                  throw new Error(`文件保存验证失败 - 存在: ${fileExists}, 大小有效: ${fileSizeValid}`);
                }
              }
            } else {
              console.error('Electron文件系统API不可用');
              throw new Error('文件系统API不可用');
            }
          } catch (saveError) {
            console.error('自动保存文件失败:', saveError);
            console.error('错误详情:', {
              outputDirectory,
              fileName: conversion.fileName,
              format: options.format,
              dataSize: convertedData.size
            });
            // 不抛出错误，让用户手动保存
          }
        }
      } else {
        throw new Error(result?.error || '转换失败');
      }

      // 清理临时文件
      await this.cleanupTempFiles(inputPath, outputPath);

    } catch (error) {
      console.error('FFmpeg转换失败:', error);
      
      // 更新转换状态为错误
      const readableError = this.toReadableError(error, file);
      if (encryptedFile) {
        throw new Error(readableError);
      }

      if (conversion) {
        conversion.status = 'error';
        conversion.error = error instanceof Error ? error.message : '转换失败';
        conversion.currentStep = '转换失败';
      }
      
      // 如果FFmpeg失败，尝试使用Web Audio API作为备用
      if (error instanceof Error && (error.message.includes('FFmpeg') || error.message.includes('转换失败'))) {
        console.log('FFmpeg转换失败，尝试使用Web Audio API作为备用');
        try {
          await this.convertWithWebAudio(file, options, fileId);
          return;
        } catch (webAudioError) {
          console.error('Web Audio API转换也失败:', webAudioError);
          throw webAudioError;
        }
      }
      
      throw error; // 重新抛出错误，让上层处理
    }
  }

  /**
   * 使用Web Audio API转换音频（备用方案）
   */
  private async convertWithWebAudio(file: File, options: ConvertOptions, fileId: string, outputDirectory?: string): Promise<void> {
    console.log('convertWithWebAudio开始执行');
    const conversion = this.conversions.get(fileId);
    if (!conversion) {
      console.log('未找到转换记录，退出');
      return;
    }

    try {
      console.log('使用Web Audio API开始转换');
      conversion.status = 'converting';
      conversion.currentStep = '使用Web Audio API转换...';
      conversion.startTime = new Date();

      // 检查Web Audio API支持
      if (!window.AudioContext && !(window as any).webkitAudioContext) {
        throw new Error('浏览器不支持Web Audio API');
      }

      // 创建音频上下文
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // 读取文件为ArrayBuffer
      conversion.progress = 10;
      conversion.currentStep = '读取文件...';
      this.updateProgressUI(fileId, 10);
      const arrayBuffer = await file.arrayBuffer();
      
      // 解码音频数据
      conversion.progress = 30;
      conversion.currentStep = '解码音频...';
      this.updateProgressUI(fileId, 30);
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // 根据目标格式进行转换
      conversion.progress = 60;
      conversion.currentStep = '编码音频...';
      this.updateProgressUI(fileId, 60);
      
      let convertedBlob: Blob;
      
      if (options.format === 'wav') {
        // 转换为WAV格式
        convertedBlob = await this.encodeWAV(audioBuffer, options);
      } else {
        // 对于其他格式，使用MediaRecorder API（如果支持）
        convertedBlob = await this.encodeWithMediaRecorder(audioBuffer, options);
      }
      
      conversion.progress = 100;
      conversion.status = 'completed';
      conversion.currentStep = '转换完成';
      this.updateProgressUI(fileId, 100);
      
      // 保存结果
      this.storeConversionResult(fileId, convertedBlob, options.format);
      
      // 关闭音频上下文
      if (audioContext.state !== 'closed') {
        await audioContext.close();
      }
      
    } catch (error) {
      console.error('Web Audio API转换失败:', error);
      
      // 更新转换状态
      if (conversion) {
        conversion.status = 'error';
        conversion.error = error instanceof Error ? error.message : '未知错误';
        conversion.currentStep = '转换失败';
      }
      
      throw error; // 重新抛出错误，让上层处理
    }
  }

  /**
   * 更新进度UI，防止白屏
   */
  private updateProgressUI(fileId: string, progress: number): void {
    requestAnimationFrame(() => {
      // 触发自定义事件通知UI更新
      window.dispatchEvent(new CustomEvent('conversionProgress', {
        detail: { fileId, progress }
      }));
    });
  }

  /**
   * 编码为WAV格式
   */
  private async encodeWAV(audioBuffer: AudioBuffer, options: ConvertOptions): Promise<Blob> {
    const sampleRate = options.sampleRate || audioBuffer.sampleRate;
    const numChannels = options.channels || audioBuffer.numberOfChannels;
    const format = 1; // PCM
    const bitDepth = 16;
    
    // 获取音频数据
    const length = audioBuffer.length * numChannels * (bitDepth / 8);
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);
    
    // WAV文件头
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    // RIFF标识
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    
    // fmt子块
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    
    // data子块
    writeString(36, 'data');
    view.setUint32(40, length, true);
    
    // 写入PCM数据
    let offset = 44;
    const channelData: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      channelData.push(audioBuffer.getChannelData(i));
    }
    
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * 使用MediaRecorder编码音频
   */
  private async encodeWithMediaRecorder(audioBuffer: AudioBuffer, options: ConvertOptions): Promise<Blob> {
    // 创建离线音频上下文
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
    
    // 创建缓冲源
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();
    
    // 渲染音频
    const renderedBuffer = await offlineContext.startRendering();
    
    // 转换为Blob（这里简化处理，实际需要根据格式编码）
    return this.encodeWAV(renderedBuffer, options);
  }

  /**
   * 存储转换结果数据
   */
  private storeConversionResult(fileId: string, data: Blob, format: string) {
    const conversion = this.conversions.get(fileId);
    if (conversion) {
      const url = URL.createObjectURL(data);
      // 存储转换结果供下载
      (window as any)[`conversion_${fileId}`] = {
        blob: data,
        url: url,
        format: format,
        fileName: conversion.fileName.replace(/\.[^/.]+$/, `.${format}`)
      };
    }
  }

  /**
   * 保存转换结果到本地
   */
  async saveConversionResult(fileId: string, outputDirectory: string): Promise<boolean> {
    try {
      const conversionData = (window as any)[`conversion_${fileId}`];
      if (!conversionData) return false;
      
      // 创建下载链接
      const a = document.createElement('a');
      a.href = conversionData.url;
      a.download = conversionData.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      return true;
    } catch (error) {
      console.error('保存失败:', error);
      return false;
    }
  }

  /**
   * 批量保存所有完成的转换结果
   */
  async saveAllCompletedResults(outputDirectory: string): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;
    
    for (const [fileId, conversion] of this.conversions.entries()) {
      if (conversion.status === 'completed') {
        const saved = await this.saveConversionResult(fileId, outputDirectory);
        if (saved) {
          success++;
        } else {
          failed++;
        }
      }
    }
    
    return { success, failed };
  }

  /**
   * 辅助方法
   */
  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || 'unknown';
  }

  private getDefaultBitrate(format: string): number {
    const defaults: Record<string, number> = {
      mp3: 320,
      wav: 1411,
      flac: 1411,
      m4a: 256,
      aac: 256,
      ogg: 192
    };
    return defaults[format] || 256;
  }

  private async getTempDir(): Promise<string> {
    // 在Electron中获取临时目录
    if (window.electronAPI?.app?.getTempPath) {
      return await window.electronAPI.app.getTempPath();
    }
    return '/tmp';
  }

  private async saveFileToTemp(file: File, path: string): Promise<void> {
    if (window.electronAPI?.fs?.writeFile) {
      const buffer = await file.arrayBuffer();
      await window.electronAPI.fs.writeFile(path, buffer);
    }
  }

  private async readFileFromTemp(path: string): Promise<Blob> {
    if (window.electronAPI?.fs?.readFile) {
      const buffer = await window.electronAPI.fs.readFile(path);
      return new Blob([buffer]);
    }
    throw new Error('无法读取文件');
  }

  private async cleanupTempFiles(...paths: string[]): Promise<void> {
    if (window.electronAPI?.fs?.unlink) {
      for (const path of paths) {
        try {
          await window.electronAPI.fs.unlink(path);
        } catch (error) {
          console.error('清理临时文件失败:', path, error);
        }
      }
    }
  }

  /**
   * 获取MIME类型
   */
  private getMimeType(format: string): string {
    const mimeTypes: { [key: string]: string } = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      ogg: 'audio/ogg'
    };
    return mimeTypes[format] || 'audio/octet-stream';
  }

  /**
   * 暂停转换
   */
  pauseConversion(): void {
    this.isConverting = false;
  }

  /**
   * 取消特定的转换
   */
  cancelConversion(fileId: string): void {
    const conversion = this.conversions.get(fileId);
    if (conversion) {
      conversion.status = 'error';
      conversion.error = '用户取消';
      
      // 从队列中移除
      this.conversionQueue = this.conversionQueue.filter(item => item.fileId !== fileId);
    }
  }

  /**
   * 清除历史记录
   */
  clearHistory(): void {
    // 清除已完成和错误的转换
    const keysToDelete: string[] = [];
    for (const [fileId, conversion] of this.conversions.entries()) {
      if (conversion.status === 'completed' || conversion.status === 'error') {
        keysToDelete.push(fileId);
        
        // 清理存储的数据
        const conversionData = (window as any)[`conversion_${fileId}`];
        if (conversionData?.url) {
          URL.revokeObjectURL(conversionData.url);
        }
        delete (window as any)[`conversion_${fileId}`];
      }
    }
    
    keysToDelete.forEach(key => this.conversions.delete(key));
  }

  /**
   * 获取所有转换进度
   */
  getAllProgress(): ConversionProgress[] {
    return Array.from(this.conversions.values());
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): { total: number; waiting: number; converting: number; completed: number; error: number } {
    const status = {
      total: this.conversions.size,
      waiting: 0,
      converting: 0,
      completed: 0,
      error: 0
    };
    
    for (const conversion of this.conversions.values()) {
      switch (conversion.status) {
        case 'waiting':
          status.waiting++;
          break;
        case 'converting':
          status.converting++;
          break;
        case 'completed':
          status.completed++;
          break;
        case 'error':
          status.error++;
          break;
      }
    }
    
    return status;
  }
}

// 导出单例
export const offlineAudioConverter = new OfflineAudioConverter();

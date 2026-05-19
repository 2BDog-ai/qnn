import { parseBuffer } from 'music-metadata';

export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  year?: number;
  genre?: string[];
  picture?: Array<{
    format: string;
    data: Uint8Array;
    description?: string;
  }>;
}

/**
 * 读取音频文件的元数据
 */
export async function readAudioMetadata(file: File): Promise<AudioMetadata> {
  try {
    console.log(`开始读取音频元数据: ${file.name}, 大小: ${file.size} bytes`);
    
    // 检查文件大小，避免处理过大或空文件
    if (file.size === 0) {
      console.warn(`文件为空: ${file.name}`);
      return getDefaultMetadata(file);
    }
    
    if (file.size > 500 * 1024 * 1024) { // 500MB 限制
      console.warn(`文件过大，跳过元数据读取: ${file.name}`);
      return getDefaultMetadata(file);
    }
    
    // 先检查文件类型
    const fileExtension = file.name.toLowerCase().split('.').pop();
    const supportedFormats = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'opus'];
    
    if (!fileExtension || !supportedFormats.includes(fileExtension)) {
      console.warn(`不支持的文件格式: ${file.name} (${fileExtension})`);
      return getDefaultMetadata(file);
    }
    
    // 将File转换为ArrayBuffer，添加超时保护
    const arrayBuffer = await Promise.race([
      file.arrayBuffer(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('文件读取超时')), 30000)
      )
    ]);
    
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.warn(`无法读取文件内容: ${file.name}`);
      return getDefaultMetadata(file);
    }
    
    console.log(`文件读取成功: ${file.name}, ArrayBuffer大小: ${arrayBuffer.byteLength} bytes`);
    
    // 使用music-metadata解析元数据，添加超时保护
    const uint8Array = new Uint8Array(arrayBuffer);
    
    const metadata = await Promise.race([
      parseBuffer(uint8Array),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('元数据解析超时')), 20000)
      )
    ]);
    
    // 验证和清理元数据
    const result: AudioMetadata = {
      title: metadata.common.title?.trim() || undefined,
      artist: metadata.common.artist?.trim() || undefined,
      album: metadata.common.album?.trim() || undefined,
      duration: metadata.format.duration && !isNaN(metadata.format.duration) && metadata.format.duration > 0 
        ? metadata.format.duration 
        : undefined,
      bitrate: metadata.format.bitrate && !isNaN(metadata.format.bitrate) && metadata.format.bitrate > 0 
        ? metadata.format.bitrate 
        : undefined,
      sampleRate: metadata.format.sampleRate && !isNaN(metadata.format.sampleRate) && metadata.format.sampleRate > 0 
        ? metadata.format.sampleRate 
        : undefined,
      channels: metadata.format.numberOfChannels && !isNaN(metadata.format.numberOfChannels) && metadata.format.numberOfChannels > 0 
        ? metadata.format.numberOfChannels 
        : undefined,
      year: metadata.common.year && !isNaN(metadata.common.year) && metadata.common.year > 0 
        ? metadata.common.year 
        : undefined,
      genre: metadata.common.genre && metadata.common.genre.length > 0 
        ? metadata.common.genre 
        : undefined,
      picture: metadata.common.picture && metadata.common.picture.length > 0 
        ? metadata.common.picture 
        : undefined
    };
    
    console.log(`元数据读取成功: ${file.name}`, {
      title: result.title,
      artist: result.artist,
      duration: result.duration,
      bitrate: result.bitrate,
      sampleRate: result.sampleRate
    });
    
    return result;
  } catch (error) {
    console.error(`读取音频元数据失败: ${file.name}`, error);
    
    // 根据错误类型提供更具体的日志
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('超时')) {
        console.error('文件读取或解析超时');
      } else if (error.message.includes('format') || error.message.includes('格式')) {
        console.error('不支持的音频格式或文件损坏');
      } else if (error.message.includes('permission') || error.message.includes('权限')) {
        console.error('文件访问权限问题');
      } else if (error.message.includes('parse') || error.message.includes('解析')) {
        console.error('元数据解析失败，可能文件损坏或格式不标准');
      }
    }
    
    // 返回基本信息
    return getDefaultMetadata(file);
  }
}

// 辅助函数：获取默认元数据
function getDefaultMetadata(file: File): AudioMetadata {
  return {
    title: file.name.replace(/\.[^/.]+$/, ''), // 移除文件扩展名
    artist: undefined,
    album: undefined,
    duration: undefined,
    bitrate: undefined,
    sampleRate: undefined,
    channels: undefined,
    year: undefined,
    genre: undefined,
    picture: undefined
  };
}

/**
 * 格式化时长
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '--:--';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化比特率
 */
export function formatBitrate(bitrate: number): string {
  if (!bitrate || isNaN(bitrate)) return '--';
  
  if (bitrate >= 1000000) {
    return `${(bitrate / 1000000).toFixed(1)} Mbps`;
  } else if (bitrate >= 1000) {
    return `${(bitrate / 1000).toFixed(0)} Kbps`;
  } else {
    return `${bitrate} bps`;
  }
}

/**
 * 格式化采样率
 */
export function formatSampleRate(sampleRate: number): string {
  if (!sampleRate || isNaN(sampleRate)) return '--';
  
  if (sampleRate >= 1000) {
    return `${(sampleRate / 1000).toFixed(1)} kHz`;
  } else {
    return `${sampleRate} Hz`;
  }
}

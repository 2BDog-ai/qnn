// 音乐解密工具类 - 已禁用
// 此功能已被禁用

// 音乐解密配置接口
export interface MusicDecryptConfig {
  filePath: string;
  outputDir: string;
  enableCloudKey?: boolean;
}

// 解密结果接口
export interface DecryptResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  format?: 'mp3' | 'flac' | 'ogg';
  decryptedData?: Uint8Array;
  metadata?: {
    title?: string;
    artists?: string[];
    album?: string;
    format?: string;
  };
}

// 基础解密器接口
export interface MusicDecryptor {
  decrypt(data: Uint8Array, config: MusicDecryptConfig): Promise<DecryptResult>;
  canHandle(filename: string): boolean;
}

// 解密器工厂类 - 已禁用
export class MusicDecryptorFactory {
  private static instance: MusicDecryptorFactory;
  
  private constructor() {}
  
  public static getInstance(): MusicDecryptorFactory {
    if (!MusicDecryptorFactory.instance) {
      MusicDecryptorFactory.instance = new MusicDecryptorFactory();
    }
    return MusicDecryptorFactory.instance;
  }
  
  public getDecryptor(filename: string): MusicDecryptor | null {
    // 解密功能已禁用
    return null;
  }
  
  public getSupportedFormats(): string[] {
    // 解密功能已禁用
    return [];
  }
  
  // 兼容性方法 - 已禁用
  public static async create(file: File): Promise<{ decryptor: MusicDecryptor | null; isVpr: boolean }> {
    return { decryptor: null, isVpr: false };
  }
}

// 主要解密函数 - 已禁用
export async function decryptMusicFile(file: File, outputDir: string = 'temp'): Promise<DecryptResult> {
  console.log(`❌ 解密功能已禁用: ${file.name}`);
  return {
    success: false,
    error: '解密功能已禁用'
  };
}

// 检测文件是否为加密格式 - 已禁用
export function isEncryptedMusicFile(filename: string): boolean {
  return false; // 不再检测加密格式
}

// 获取支持的加密格式列表 - 已禁用
export function getSupportedEncryptedFormats(): string[] {
  return []; // 不再支持任何加密格式
}

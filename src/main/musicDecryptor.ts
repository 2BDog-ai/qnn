import { app, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import * as crypto from 'crypto';
import lzma = require('lzma-native');

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);

interface DecryptOptions {
  inputData: Uint8Array;
  inputPath?: string;
  outputPath?: string;
  format?: 'ncm' | 'kgm' | 'auto';
}

interface DecryptResult {
  success: boolean;
  outputPath?: string;
  outputData?: Uint8Array;
  format?: 'mp3' | 'flac';
  error?: string;
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
  };
}

/**
 * 音乐解密管理器
 * 支持网易云 NCM 和酷狗 KGM 格式
 */
class MusicDecryptor {
  private tempDir: string;
  private static kugouKeyCache: Buffer | null = null;
  private static kugouKeyPromise: Promise<Buffer> | null = null;

  constructor(setupIpc: boolean = true) {
    this.tempDir = path.join(app.getPath('temp'), 'music-decrypt');
    this.ensureTempDir();
    if (setupIpc) {
      this.setupIpcHandlers();
    }
  }

  /**
   * 确保临时目录存在
   */
  private async ensureTempDir() {
    try {
      if (!fs.existsSync(this.tempDir)) {
        await mkdir(this.tempDir, { recursive: true });
      }
    } catch (error) {
      console.error('创建临时目录失败:', error);
    }
  }

  /**
   * 设置 IPC 处理器
   */
  private setupIpcHandlers() {
    console.log('设置音乐解密 IPC 处理器...');

    // 解密音频文件
    ipcMain.handle('music:decrypt', async (event, options: DecryptOptions) => {
      console.log('music:decrypt 被调用');
      try {
        return await this.decryptMusic(options);
      } catch (error) {
        console.error('音乐解密失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : '解密失败'
        };
      }
    });

    // 检查是否支持解密
    ipcMain.handle('music:canDecrypt', async (event, format: string) => {
      return this.canDecrypt(format);
    });

    console.log('音乐解密 IPC 处理器设置完成');
  }

  private getKugouKeyPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'kugou_key.xz');
    }
    return path.join(app.getAppPath(), 'resources', 'kugou_key.xz');
  }

  private async getKugouPubKey(expectedSize: number): Promise<Buffer> {
    if (MusicDecryptor.kugouKeyCache) {
      return MusicDecryptor.kugouKeyCache;
    }
    if (MusicDecryptor.kugouKeyPromise) {
      return MusicDecryptor.kugouKeyPromise;
    }

    MusicDecryptor.kugouKeyPromise = (async () => {
      const keyPath = this.getKugouKeyPath();
      const xzData = await readFile(keyPath);
      const decompressed = await lzma.decompress(xzData);
      const keyBuffer = Buffer.isBuffer(decompressed) ? decompressed : Buffer.from(decompressed as Uint8Array);

      if (keyBuffer.length < expectedSize) {
        throw new Error(`KGM key length invalid: ${keyBuffer.length}, expected >= ${expectedSize}`);
      }

      MusicDecryptor.kugouKeyCache = keyBuffer;
      return keyBuffer;
    })();

    try {
      return await MusicDecryptor.kugouKeyPromise;
    } finally {
      MusicDecryptor.kugouKeyPromise = null;
    }
  }

  /**
   * 检查是否支持解密指定格式
   */
  canDecrypt(format: string): boolean {
    const supportedFormats = ['ncm', 'kgm'];
    return supportedFormats.includes(format.toLowerCase());
  }

  /**
   * 解密音乐文件
   */
  async decryptMusic(options: DecryptOptions): Promise<DecryptResult> {
    console.log('🔍 decryptMusic 被调用');
    console.log('🔍 options.format:', options.format);
    console.log('🔍 options.inputData 长度:', options.inputData.length);
    console.log('🔍 options.inputData 前8字节:', Array.from(options.inputData.slice(0, 8)));
    
    // 如果 format 是 'auto' 或未指定，则自动检测
    const format = (options.format && options.format !== 'auto') 
      ? options.format 
      : this.detectFormat(options.inputData);
    
    console.log(`开始解密 ${format} 格式文件`);
    console.log('输入数据长度:', options.inputData.length);
    console.log('输入数据前16字节:', Array.from(options.inputData.slice(0, 16)));

    if (format === 'ncm') {
      console.log('调用 NCM 解密');
      return await this.decryptNCM(options);
    } else if (format === 'kgm') {
      console.log('调用 KGM 解密');
      return await this.decryptKGM(options);
    } else {
      console.error('不支持的文件格式:', format);
      console.error('文件头信息:', {
        length: options.inputData.length,
        first8Bytes: Array.from(options.inputData.slice(0, 8)),
        first8Hex: Buffer.from(options.inputData.slice(0, 8)).toString('hex')
      });
      return {
        success: false,
        error: `不支持的文件格式: ${format}`
      };
    }
  }

  /**
   * 检测文件格式
   */
  private detectFormat(data: Uint8Array): 'ncm' | 'kgm' | 'auto' {
    console.log('detectFormat 开始检测，数据长度:', data.length);
    
    // NCM 文件头: CTENFDAM (字节: 67, 84, 69, 78, 70, 68, 65, 77)
    if (data.length >= 8) {
      console.log('检查 NCM 文件头，前8字节:', Array.from(data.slice(0, 8)));
      
      // 直接比较字节值
      if (data[0] === 0x43 && data[1] === 0x54 && data[2] === 0x45 && data[3] === 0x4E &&
          data[4] === 0x46 && data[5] === 0x44 && data[6] === 0x41 && data[7] === 0x4D) {
        console.log('✓ 检测到 NCM 格式');
        return 'ncm';
      }
      
      // 备用方法：使用十六进制字符串比较
      const header = Buffer.from(data.slice(0, 8));
      const hexString = header.toString('hex').toLowerCase();
      console.log('文件头十六进制:', hexString);
      if (hexString === '4354454e4644414d') {
        console.log('✓ 通过十六进制检测到 NCM 格式');
        return 'ncm';
      }
    }

    // KGM 文件头检测
    if (data.length >= 28) {
      console.log('检查 KGM 文件头，前4字节:', Array.from(data.slice(0, 4)));
      
      // KGM 魔术头: 0x7c, 0xd5, 0x32, 0xeb...
      if (data[0] === 0x7C && data[1] === 0xD5 && data[2] === 0x32 && data[3] === 0xEB) {
        console.log('✓ 检测到 KGM 格式');
        return 'kgm';
      }
    }

    console.log('✗ 未检测到已知格式，返回 auto');
    return 'auto';
  }

  /**
   * 解密 NCM 文件（网易云音乐）
   */
  private async decryptNCM(options: DecryptOptions): Promise<DecryptResult> {
    try {
      // 使用内置的 JavaScript 实现
      const result = await this.decryptNCMBuiltin(options.inputData);
      return result;
    } catch (error) {
      console.error('NCM 解密失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'NCM 解密失败'
      };
    }
  }

  /**
   * 内置 NCM 解密实现
   */
  private async decryptNCMBuiltin(data: Uint8Array): Promise<DecryptResult> {
    console.log('decryptNCMBuiltin 开始执行');
    const buffer = Buffer.from(data);
    let offset = 0;

    // 验证文件头 "CTENFDAM"
    const header = buffer.slice(offset, offset + 8);
    const headerHex = header.toString('hex').toLowerCase();
    console.log('NCM 文件头验证:', {
      bytes: Array.from(header),
      hex: headerHex,
      expected: '4354454e4644414d'
    });
    
    offset += 8;
    if (headerHex !== '4354454e4644414d') {
      throw new Error(`不是有效的 NCM 文件，文件头: ${headerHex}`);
    }
    
    console.log('✓ NCM 文件头验证通过');

    // 跳过 2 字节
    offset += 2;

    // 读取密钥数据长度
    const keyLen = buffer.readUInt32LE(offset);
    offset += 4;

    if (keyLen <= 0) {
      throw new Error('NCM 文件损坏：密钥长度无效');
    }

    // 读取并解密密钥数据
    const keyData = buffer.slice(offset, offset + keyLen);
    offset += keyLen;

    // XOR 解密密钥
    const decryptedKey = Buffer.alloc(keyLen);
    for (let i = 0; i < keyLen; i++) {
      decryptedKey[i] = keyData[i] ^ 0x64;
    }

    // AES 解密密钥
    const coreKey = Buffer.from('hzHRAmso5kInbaxW', 'utf-8');
    const decipher = crypto.createDecipheriv('aes-128-ecb', coreKey, null);
    decipher.setAutoPadding(true);
    
    let rawKeyData = Buffer.concat([
      decipher.update(decryptedKey),
      decipher.final()
    ]);

    // 提取实际密钥（跳过 "neteasecloudmusic" 前缀）
    const actualKey = rawKeyData.slice(17);

    // 构建密钥盒
    const keyBox = this.buildKeyBox(actualKey);

    // 读取元数据长度
    const metaLen = buffer.readUInt32LE(offset);
    offset += 4;

    let metadata: any = {};
    if (metaLen > 0) {
      // 读取并解密元数据
      const metaData = buffer.slice(offset, offset + metaLen);
      offset += metaLen;

      try {
        // XOR 解密
        const decryptedMeta = Buffer.alloc(metaLen);
        for (let i = 0; i < metaLen; i++) {
          decryptedMeta[i] = metaData[i] ^ 0x63;
        }

        // Base64 解码（跳过 "163 key(Don't modify):" 前缀）
        const base64Data = decryptedMeta.slice(22).toString('utf-8');
        const metaBuffer = Buffer.from(base64Data, 'base64');

        // AES 解密元数据
        const modifyKey = Buffer.from('#14ljk_!\\]&0U<\'(', 'utf-8');
        const metaDecipher = crypto.createDecipheriv('aes-128-ecb', modifyKey, null);
        metaDecipher.setAutoPadding(true);
        
        const decryptedMetaData = Buffer.concat([
          metaDecipher.update(metaBuffer),
          metaDecipher.final()
        ]);

        // 解析 JSON（跳过 "music:" 前缀）
        const jsonStr = decryptedMetaData.slice(6).toString('utf-8');
        metadata = JSON.parse(jsonStr);
      } catch (error) {
        console.warn('解析元数据失败:', error);
      }
    }

    // 跳过 CRC32 和图片数据
    offset += 5; // CRC32 (4) + 未知 (1)
    
    const coverFrameLen = buffer.readUInt32LE(offset);
    offset += 4;
    
    const coverLen = buffer.readUInt32LE(offset);
    offset += 4;
    
    if (coverLen > 0) {
      offset += coverLen;
    }
    offset += (coverFrameLen - coverLen);

    // 解密音频数据
    const audioData = buffer.slice(offset);
    const decryptedAudio = Buffer.alloc(audioData.length);

    for (let i = 0; i < audioData.length; i++) {
      const j = (i + 1) & 0xff;
      const keyIndex = (keyBox[j] + keyBox[(keyBox[j] + j) & 0xff]) & 0xff;
      decryptedAudio[i] = audioData[i] ^ keyBox[keyIndex];
    }

    // 检测音频格式
    let format: 'mp3' | 'flac' = 'mp3';
    if (decryptedAudio.length >= 3) {
      // ID3 标签表示 MP3
      if ((decryptedAudio[0] === 0x49 && decryptedAudio[1] === 0x44 && decryptedAudio[2] === 0x33) ||
          (decryptedAudio[0] === 0xff && (decryptedAudio[1] & 0xe0) === 0xe0)) {
        format = 'mp3';
      } else if (decryptedAudio[0] === 0x66 && decryptedAudio[1] === 0x4C && 
                 decryptedAudio[2] === 0x61 && decryptedAudio[3] === 0x43) {
        format = 'flac';
      }
    }

    return {
      success: true,
      outputData: new Uint8Array(decryptedAudio),
      format: format,
      metadata: {
        title: metadata.musicName,
        artist: metadata.artist?.map((a: any[]) => a[0]).join('/'),
        album: metadata.album
      }
    };
  }

  /**
   * 构建密钥盒（RC4 密钥调度算法）
   */
  private buildKeyBox(key: Buffer): Uint8Array {
    const keyBox = new Uint8Array(256);
    
    // 初始化
    for (let i = 0; i < 256; i++) {
      keyBox[i] = i;
    }

    // 密钥调度
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + keyBox[i] + key[i % key.length]) & 0xff;
      // 交换
      [keyBox[i], keyBox[j]] = [keyBox[j], keyBox[i]];
    }

    return keyBox;
  }

  /**
   * 解密 KGM 文件（酷狗音乐）
   */
  private async decryptKGM(options: DecryptOptions): Promise<DecryptResult> {
    try {
      const result = await this.decryptKGMBuiltin(options.inputData);
      return result;
    } catch (error) {
      console.error('KGM 解密失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'KGM 解密失败'
      };
    }
  }

  /**
   * 内置 KGM/VPR 解密实现
   * 基于 kugou-kgm-decoder 项目的算法
   */
  private async decryptKGMBuiltin(data: Uint8Array): Promise<DecryptResult> {
    console.log('decryptKGMBuiltin 开始执行');
    const buffer = Buffer.from(data);
    
    // KGM 文件头部大小
    const HEADER_LEN = 1024;
    const OWN_KEY_LEN = 17;
    const PUB_KEY_LEN = 1170494464;
    const PUB_KEY_LEN_MAGNIFICATION = 16;
    const expectedKeySize = PUB_KEY_LEN / PUB_KEY_LEN_MAGNIFICATION;
    
    // KGM 魔术头
    const MAGIC_HEADER = Buffer.from([
      0x7c, 0xd5, 0x32, 0xeb, 0x86, 0x02, 0x7f, 0x4b, 0xa8, 0xaf, 0xa6, 0x8e, 0x0f, 0xff, 0x99,
      0x14, 0x00, 0x04, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00
    ]);
    
    // 验证文件头
    if (buffer.length < HEADER_LEN) {
      throw new Error('文件太小，不是有效的 KGM 文件');
    }
    
    const headerMagic = buffer.slice(0, MAGIC_HEADER.length);
    if (!headerMagic.equals(MAGIC_HEADER)) {
      throw new Error('不是有效的 KGM 文件头');
    }
    
    console.log('✓ KGM 文件头验证通过');
    
    // 提取 own_key（从偏移 0x1c 开始的 16 字节）
    const ownKey = Buffer.alloc(OWN_KEY_LEN);
    buffer.copy(ownKey, 0, 0x1c, 0x2c);
    ownKey[16] = 0; // 第 17 字节为 0
    
    console.log('提取 own_key 完成');
    
    // 公钥掩码（PUB_KEY_MEND）
    const PUB_KEY_MEND = Buffer.from([
      0xB8, 0xD5, 0x3D, 0xB2, 0xE9, 0xAF, 0x78, 0x8C, 0x83, 0x33, 0x71, 0x51, 0x76, 0xA0,
      0xCD, 0x37, 0x2F, 0x3E, 0x35, 0x8D, 0xA9, 0xBE, 0x98, 0xB7, 0xE7, 0x8C, 0x22, 0xCE,
      0x5A, 0x61, 0xDF, 0x68, 0x69, 0x89, 0xFE, 0xA5, 0xB6, 0xDE, 0xA9, 0x77, 0xFC, 0xC8,
      0xBD, 0xBD, 0xE5, 0x6D, 0x3E, 0x5A, 0x36, 0xEF, 0x69, 0x4E, 0xBE, 0xE1, 0xE9, 0x66,
      0x1C, 0xF3, 0xD9, 0x02, 0xB6, 0xF2, 0x12, 0x9B, 0x44, 0xD0, 0x6F, 0xB9, 0x35, 0x89,
      0xB6, 0x46, 0x6D, 0x73, 0x82, 0x06, 0x69, 0xC1, 0xED, 0xD7, 0x85, 0xC2, 0x30, 0xDF,
      0xA2, 0x62, 0xBE, 0x79, 0x2D, 0x62, 0x62, 0x3D, 0x0D, 0x7E, 0xBE, 0x48, 0x89, 0x23,
      0x02, 0xA0, 0xE4, 0xD5, 0x75, 0x51, 0x32, 0x02, 0x53, 0xFD, 0x16, 0x3A, 0x21, 0x3B,
      0x16, 0x0F, 0xC3, 0xB2, 0xBB, 0xB3, 0xE2, 0xBA, 0x3A, 0x3D, 0x13, 0xEC, 0xF6, 0x01,
      0x45, 0x84, 0xA5, 0x70, 0x0F, 0x93, 0x49, 0x0C, 0x64, 0xCD, 0x31, 0xD5, 0xCC, 0x4C,
      0x07, 0x01, 0x9E, 0x00, 0x1A, 0x23, 0x90, 0xBF, 0x88, 0x1E, 0x3B, 0xAB, 0xA6, 0x3E,
      0xC4, 0x73, 0x47, 0x10, 0x7E, 0x3B, 0x5E, 0xBC, 0xE3, 0x00, 0x84, 0xFF, 0x09, 0xD4,
      0xE0, 0x89, 0x0F, 0x5B, 0x58, 0x70, 0x4F, 0xFB, 0x65, 0xD8, 0x5C, 0x53, 0x1B, 0xD3,
      0xC8, 0xC6, 0xBF, 0xEF, 0x98, 0xB0, 0x50, 0x4F, 0x0F, 0xEA, 0xE5, 0x83, 0x58, 0x8C,
      0x28, 0x2C, 0x84, 0x67, 0xCD, 0xD0, 0x9E, 0x47, 0xDB, 0x27, 0x50, 0xCA, 0xF4, 0x63,
      0x63, 0xE8, 0x97, 0x7F, 0x1B, 0x4B, 0x0C, 0xC2, 0xC1, 0x21, 0x4C, 0xCC, 0x58, 0xF5,
      0x94, 0x52, 0xA3, 0xF3, 0xD3, 0xE0, 0x68, 0xF4, 0x00, 0x23, 0xF3, 0x5E, 0x0A, 0x7B,
      0x93, 0xDD, 0xAB, 0x12, 0xB2, 0x13, 0xE8, 0x84, 0xD7, 0xA7, 0x9F, 0x0F, 0x32, 0x4C,
      0x55, 0x1D, 0x04, 0x36, 0x52, 0xDC, 0x03, 0xF3, 0xF9, 0x4E, 0x42, 0xE9, 0x3D, 0x61,
      0xEF, 0x7C, 0xB6, 0xB3, 0x93, 0x50
    ]);

    const pubKey = await this.getKugouPubKey(expectedKeySize);
    
    // 提取音频数据
    const audioData = buffer.slice(HEADER_LEN);
    const decryptedAudio = Buffer.alloc(audioData.length);
    
    console.log('开始解密音频数据，长度:', audioData.length);
    
    // 解密算法
    for (let i = 0; i < audioData.length; i++) {
      const ownKeyIndex = i % OWN_KEY_LEN;
      let med8 = ownKey[ownKeyIndex] ^ audioData[i];
      med8 ^= (med8 & 0x0f) << 4;

      const pubKeyIndex = Math.floor(i / PUB_KEY_LEN_MAGNIFICATION);
      if (pubKeyIndex >= pubKey.length) {
        throw new Error(`KGM pub key index out of range: ${pubKeyIndex}`);
      }

      let msk8 = PUB_KEY_MEND[i % PUB_KEY_MEND.length] ^ pubKey[pubKeyIndex];
      msk8 ^= (msk8 & 0x0f) << 4;
      decryptedAudio[i] = med8 ^ msk8;
    }
    
    // 检测解密后的音频格式
    let format: 'mp3' | 'flac' = 'mp3';
    if (decryptedAudio.length >= 4) {
      // 检查 MP3 标识 (ID3 或 0xFF 0xFB)
      if ((decryptedAudio[0] === 0x49 && decryptedAudio[1] === 0x44 && decryptedAudio[2] === 0x33) ||
          (decryptedAudio[0] === 0xFF && (decryptedAudio[1] & 0xE0) === 0xE0)) {
        format = 'mp3';
        console.log('解密后格式: MP3');
      }
      // 检查 FLAC 标识
      else if (decryptedAudio[0] === 0x66 && decryptedAudio[1] === 0x4C && 
               decryptedAudio[2] === 0x61 && decryptedAudio[3] === 0x43) {
        format = 'flac';
        console.log('解密后格式: FLAC');
      }
    }
    
    console.log('✓ KGM 解密成功');
    
    return {
      success: true,
      outputData: new Uint8Array(decryptedAudio),
      format: format,
      metadata: {}
    };
  }

  /**
   * 清理临时文件
   */
  async cleanup() {
    try {
      const files = await fs.promises.readdir(this.tempDir);
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        await unlink(filePath);
      }
    } catch (error) {
      console.error('清理临时文件失败:', error);
    }
  }
}

export { MusicDecryptor, DecryptOptions, DecryptResult };






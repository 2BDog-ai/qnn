import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * NCM 文件解密器 - 网易云音乐加密格式
 */
export class NcmDecryptor {
  // NCM 文件魔术头
  private static readonly NCM_HEADER = Buffer.from([0x43, 0x54, 0x45, 0x4E, 0x46, 0x44, 0x41, 0x4D]);
  
  // 核心密钥
  private static readonly CORE_KEY = Buffer.from([
    0x68, 0x7A, 0x48, 0x52, 0x41, 0x6D, 0x73, 0x6F, 0x35, 0x6B,
    0x49, 0x6E, 0x62, 0x61, 0x78, 0x57
  ]);
  
  // 元数据密钥
  private static readonly META_KEY = Buffer.from([
    0x23, 0x31, 0x34, 0x6C, 0x6A, 0x6B, 0x5F, 0x21, 0x5C, 0x5D,
    0x26, 0x30, 0x55, 0x3C, 0x27, 0x28
  ]);

  /**
   * 解密 NCM 文件
   * @param inputPath NCM 文件路径
   * @param outputDir 输出目录（可选，默认为输入文件所在目录）
   * @returns 解密后的文件路径
   */
  public static async decrypt(inputPath: string, outputDir?: string): Promise<string> {
    console.log('开始解密 NCM 文件:', inputPath);
    
    // 读取文件
    const fileData = fs.readFileSync(inputPath);
    let offset = 0;

    // 验证文件头
    const header = fileData.slice(offset, offset + 8);
    if (!header.equals(this.NCM_HEADER)) {
      throw new Error('不是有效的 NCM 文件');
    }
    offset += 10; // 跳过文件头（8字节）+ 2字节版本号

    // 解密 RC4 密钥
    const keyLength = fileData.readUInt32LE(offset);
    offset += 4;
    const encryptedKey = fileData.slice(offset, offset + keyLength);
    offset += keyLength;
    
    const rc4Key = this.decryptRc4Key(encryptedKey);
    console.log('RC4 密钥解密成功');

    // 解密元数据
    const metaLength = fileData.readUInt32LE(offset);
    offset += 4;
    const encryptedMeta = fileData.slice(offset, offset + metaLength);
    offset += metaLength;
    
    const metadata = this.decryptMetadata(encryptedMeta);
    console.log('元数据解密成功:', metadata);

    // 跳过 CRC32 和 5 字节未知数据
    offset += 4 + 5;

    // 读取封面
    const coverLength = fileData.readUInt32LE(offset);
    offset += 4;
    const cover = fileData.slice(offset, offset + coverLength);
    offset += coverLength;
    console.log('封面数据长度:', coverLength);

    // 生成输出文件路径
    const outputPath = this.generateOutputPath(inputPath, metadata, outputDir);
    console.log('输出文件路径:', outputPath);

    // 解密音乐数据
    const musicData = fileData.slice(offset);
    const decryptedMusic = this.decryptMusicData(musicData, rc4Key);
    
    // 修正音频头
    const fixedMusic = this.fixAudioHeader(decryptedMusic);

    // 写入文件
    fs.writeFileSync(outputPath, fixedMusic);
    console.log('NCM 文件解密完成:', outputPath);

    return outputPath;
  }

  /**
   * 解密 RC4 密钥
   */
  private static decryptRc4Key(encryptedKey: Buffer): Buffer {
    // XOR 解密
    const xorKey = Buffer.alloc(encryptedKey.length);
    for (let i = 0; i < encryptedKey.length; i++) {
      xorKey[i] = encryptedKey[i] ^ 0x64;
    }

    // AES-128-ECB 解密
    const decipher = crypto.createDecipheriv('aes-128-ecb', this.CORE_KEY, null);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([decipher.update(xorKey), decipher.final()]);

    // 去除前 17 字节 ("neteasecloudmusic")
    return decrypted.slice(17);
  }

  /**
   * 解密元数据
   */
  private static decryptMetadata(encryptedMeta: Buffer): any {
    // XOR 解密
    const xorMeta = Buffer.alloc(encryptedMeta.length);
    for (let i = 0; i < encryptedMeta.length; i++) {
      xorMeta[i] = encryptedMeta[i] ^ 0x63;
    }

    // 去除前 22 字节 ("music:")
    const base64Data = xorMeta.slice(22);

    // Base64 解码
    const decoded = Buffer.from(base64Data.toString(), 'base64');

    // AES-128-ECB 解密
    const decipher = crypto.createDecipheriv('aes-128-ecb', this.META_KEY, null);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([decipher.update(decoded), decipher.final()]);

    // 去除前 6 字节 ("music:")
    const jsonData = decrypted.slice(6);

    // 解析 JSON（去除尾部的填充字节）
    const jsonStr = jsonData.toString('utf8').replace(/\0+$/, '');
    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      console.warn('元数据解析失败，使用默认值');
      return {
        musicName: 'Unknown',
        artist: [['Unknown']],
        album: 'Unknown',
        format: 'mp3'
      };
    }
  }

  /**
   * 解密音乐数据
   */
  private static decryptMusicData(musicData: Buffer, rc4Key: Buffer): Buffer {
    // 生成 S-box
    const S = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      S[i] = i;
    }

    // RC4-KSA 初始化
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + S[i] + rc4Key[i % rc4Key.length]) & 0xFF;
      [S[i], S[j]] = [S[j], S[i]];
    }

    // 解密数据
    const decrypted = Buffer.alloc(musicData.length);
    for (let idx = 0; idx < musicData.length; idx++) {
      const i = (idx + 1) % 256;
      const k = (S[i] + S[(i + S[i]) % 256]) % 256;
      decrypted[idx] = musicData[idx] ^ S[k];
    }

    return decrypted;
  }

  /**
   * 修正音频头
   */
  private static fixAudioHeader(data: Buffer): Buffer {
    const FLAC = Buffer.from('fLaC');
    const ID3 = Buffer.from('ID3');
    const MP3_HEADERS = [
      Buffer.from([0xFF, 0xFB]),
      Buffer.from([0xFF, 0xF3]),
      Buffer.from([0xFF, 0xF2])
    ];

    const SCAN_LEN = Math.min(4096, data.length - 4);

    // 查找有效的音频头
    for (let i = 0; i < SCAN_LEN; i++) {
      // 检查 FLAC
      if (i + 4 <= data.length && data.slice(i, i + 4).equals(FLAC)) {
        console.log('找到 FLAC 头，位置:', i);
        return data.slice(i);
      }
      // 检查 ID3
      if (i + 3 <= data.length && data.slice(i, i + 3).equals(ID3)) {
        console.log('找到 ID3 头，位置:', i);
        return data.slice(i);
      }
      // 检查 MP3
      for (const mp3Header of MP3_HEADERS) {
        if (i + 2 <= data.length && data.slice(i, i + 2).equals(mp3Header)) {
          console.log('找到 MP3 头，位置:', i);
          return data.slice(i);
        }
      }
    }

    console.warn('未找到有效的音频头，返回原始数据');
    return data;
  }

  /**
   * 生成输出文件路径
   */
  private static generateOutputPath(inputPath: string, metadata: any, outputDir?: string): string {
    const dir = outputDir || path.dirname(inputPath);
    
    // 获取元数据
    const title = metadata.musicName || 'Unknown';
    const artists = metadata.artist || [['Unknown']];
    const format = metadata.format || 'mp3';
    
    // 创建艺术家字符串（最多3个）
    const artistStr = artists.slice(0, 3).map((a: any) => Array.isArray(a) ? a[0] : a).join(',');
    
    // 创建文件名
    let fileName = `${title} - ${artistStr}.${format}`;
    
    // 替换非法字符
    fileName = fileName
      .replace(/[?]/g, '？')
      .replace(/[:]/g, '：')
      .replace(/[*]/g, '＊')
      .replace(/["]/g, '＂')
      .replace(/[<]/g, '＜')
      .replace(/[>]/g, '＞')
      .replace(/[|]/g, '｜')
      .replace(/[/]/g, '／')
      .replace(/[\\]/g, '＼');
    
    return path.join(dir, fileName);
  }
}

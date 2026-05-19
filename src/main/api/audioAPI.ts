import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AudioFile, Playlist } from '../../renderer/types';

export class AudioAPI {
  private musicLibraryPath: string;
  private playlistsPath: string;
  
  constructor() {
    // 使用 Electron 的 app.getPath 来获取用户数据目录，确保跨平台兼容性
    const userDataPath = app.getPath('userData');
    this.musicLibraryPath = path.join(userDataPath, 'music-library');
    this.playlistsPath = path.join(userDataPath, 'playlists.json');
    
    console.log('AudioAPI: 用户数据路径:', userDataPath);
    console.log('AudioAPI: 音乐库路径:', this.musicLibraryPath);
    console.log('AudioAPI: 播放列表路径:', this.playlistsPath);
    
    // 确保目录存在
    this.ensureDirectories();
  }
  
  private ensureDirectories(): void {
    if (!fs.existsSync(this.musicLibraryPath)) {
      fs.mkdirSync(this.musicLibraryPath, { recursive: true });
    }
  }
  
  /**
   * 导入音频文件
   */
  async importAudioFiles(filePaths: string[]): Promise<AudioFile[]> {
    const importedFiles: AudioFile[] = [];
    
    for (const filePath of filePaths) {
      try {
        const audioFile = await this.processAudioFile(filePath);
        importedFiles.push(audioFile);
        
        // 复制文件到音乐库目录
        const fileName = path.basename(filePath);
        const destPath = path.join(this.musicLibraryPath, fileName);
        
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(filePath, destPath);
        }
        
      } catch (error) {
        console.error(`导入文件失败: ${filePath}`, error);
      }
    }
    
    return importedFiles;
  }
  
  /**
   * 处理音频文件，提取元数据
   */
  private async processAudioFile(filePath: string): Promise<AudioFile> {
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1);
    
    // 这里应该使用音频处理库来提取真实的元数据
    // 暂时使用文件信息
    const audioFile: AudioFile = {
      id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      filePath: filePath,
      fileName: fileName,
      displayName: path.parse(fileName).name,
      artist: '',
      album: '',
      duration: 0, // 需要音频处理库来获取
      fileSize: stats.size,
      format: ext,
      bitrate: 0, // 需要音频处理库来获取
      sampleRate: 0, // 需要音频处理库来获取
      addedTime: new Date(),
      playCount: 0,
      isFavorite: false,
      isTrimmed: false,
      customTags: []
    };
    
    return audioFile;
  }
  
  /**
   * 删除音频文件
   */
  async deleteAudioFile(id: string): Promise<void> {
    // 这里应该实现删除逻辑
    console.log(`删除音频文件: ${id}`);
  }
  
  /**
   * 更新音频文件信息
   */
  async updateAudioFile(id: string, updates: Partial<AudioFile>): Promise<void> {
    // 这里应该实现更新逻辑
    console.log(`更新音频文件: ${id}`, updates);
  }
  
  /**
   * 创建播放列表
   */
  async createPlaylist(name: string, description: string = ''): Promise<Playlist> {
    const playlists = this.loadPlaylists();
    
    const newPlaylist: Playlist = {
      id: `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      audioFiles: [],
      createdTime: new Date(),
      updatedTime: new Date(),
      isDefault: false,
      sortOrder: 'added_time_desc' as any
    };
    
    playlists.push(newPlaylist);
    this.savePlaylists(playlists);
    
    return newPlaylist;
  }
  
  /**
   * 更新播放列表
   */
  async updatePlaylist(id: string, updates: Partial<Playlist>): Promise<void> {
    const playlists = this.loadPlaylists();
    const index = playlists.findIndex(p => p.id === id);
    
    if (index !== -1) {
      playlists[index] = { ...playlists[index], ...updates, updatedTime: new Date() };
      this.savePlaylists(playlists);
    }
  }
  
  /**
   * 删除播放列表
   */
  async deletePlaylist(id: string): Promise<void> {
    const playlists = this.loadPlaylists();
    const filteredPlaylists = playlists.filter(p => p.id !== id);
    this.savePlaylists(filteredPlaylists);
  }
  
  /**
   * 加载播放列表
   */
  private loadPlaylists(): Playlist[] {
    try {
      if (fs.existsSync(this.playlistsPath)) {
        const data = fs.readFileSync(this.playlistsPath, 'utf8');
        const playlists = JSON.parse(data);
        
        // 转换日期字符串为Date对象
        return playlists.map((playlist: any) => ({
          ...playlist,
          createdTime: new Date(playlist.createdTime),
          updatedTime: new Date(playlist.updatedTime)
        }));
      }
    } catch (error) {
      console.error('加载播放列表失败:', error);
    }
    
    return [];
  }
  
  /**
   * 保存播放列表
   */
  private savePlaylists(playlists: Playlist[]): void {
    try {
      fs.writeFileSync(this.playlistsPath, JSON.stringify(playlists, null, 2));
    } catch (error) {
      console.error('保存播放列表失败:', error);
    }
  }
}

import { DatabaseManager } from './database';
import { AudioFile, Playlist, SortOrder } from '../renderer/types';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export class DataManager extends EventEmitter {
  private static instance: DataManager;
  private db: DatabaseManager;
  private musicFiles: Map<string, AudioFile> = new Map();
  private playlists: Map<string, Playlist> = new Map();
  private currentPlaylistId: string | null = null;

  private constructor() {
    super();
    
    // 初始化数据库
    this.db = DatabaseManager.getInstance();
    
    // 初始化内存数据结构
    this.musicFiles = new Map();
    this.playlists = new Map();
    
    // 加载数据
    this.loadData();
    
    // 确保有当前歌单
    if (!this.currentPlaylistId && this.playlists.size > 0) {
      this.currentPlaylistId = Array.from(this.playlists.keys())[0];
    }
    
    console.log('DataManager初始化完成');
  }

  public static getInstance(): DataManager {
    if (!DataManager.instance) {
      DataManager.instance = new DataManager();
    }
    return DataManager.instance;
  }

  private loadData(): void {
    try {
      console.log('DataManager: 开始加载数据...');
      
      // 🔧 修复：检查数据库连接
      if (!this.db) {
        console.error('❌ DataManager: 数据库未初始化');
        throw new Error('数据库未初始化');
      }
      
      // 加载音乐文件
      const musicFiles = this.db.getAllMusicFiles();
      console.log('DataManager: 从数据库加载音乐文件:', musicFiles.length, '个');
      
      this.musicFiles = new Map(musicFiles.map(m => [m.id, m]));
      
      // 加载播放列表
      const playlists = this.db.getAllPlaylists();
      console.log('DataManager: 从数据库加载播放列表:', playlists.length, '个');
      
      // 🔧 修复：验证播放列表数据完整性
      const validPlaylists = playlists.filter(p => {
        if (!p.id || !p.name) {
          console.warn(`⚠️ 发现无效播放列表数据:`, p);
          return false;
        }
        return true;
      });
      
      if (validPlaylists.length !== playlists.length) {
        console.warn(`⚠️ 过滤掉 ${playlists.length - validPlaylists.length} 个无效播放列表`);
      }
      
      this.playlists = new Map(validPlaylists.map(p => [p.id, p]));
      
      // 确保默认歌单存在 - 增强Windows版本兼容性
      if (this.playlists.size === 0) {
        console.log('DataManager: 创建默认歌单');
        try {
          const defaultPlaylist = this.createPlaylist({
            name: '默认歌单',
            description: '系统默认歌单',
            isDefault: true,
            audioFiles: [],
            sortOrder: 'added_time_desc' as any
          });
          
          // 🔧 修复：验证创建结果
          if (!defaultPlaylist || !defaultPlaylist.id) {
            throw new Error('createPlaylist 在 loadData 中返回了无效结果');
          }
          
          this.currentPlaylistId = defaultPlaylist.id;
          console.log('DataManager: 默认歌单创建成功:', defaultPlaylist.id);
        } catch (error) {
          console.error('DataManager: 创建默认歌单失败:', error);
          
          // Windows系统特别处理：尝试重新创建
          if (process.platform === 'win32') {
            console.log('DataManager: Windows平台，尝试延迟重新创建默认歌单...');
            setTimeout(() => {
              try {
                const retryDefaultPlaylist = this.createPlaylist({
                  name: '默认歌单',
                  description: '系统默认歌单',
                  isDefault: true,
                  audioFiles: [],
                  sortOrder: 'added_time_desc' as any
                });
                
                if (retryDefaultPlaylist && retryDefaultPlaylist.id) {
                  this.currentPlaylistId = retryDefaultPlaylist.id;
                  console.log('DataManager: Windows平台默认歌单重新创建成功:', retryDefaultPlaylist.id);
                } else {
                  console.error('DataManager: Windows平台延迟创建也返回无效结果');
                }
              } catch (retryError) {
                console.error('DataManager: Windows平台默认歌单重新创建失败:', retryError);
              }
            }, 1000);
          }
          throw error;
        }
      } else if (!this.currentPlaylistId && validPlaylists.length > 0) {
        // 🔧 修复：安全地设置第一个歌单为当前歌单
        const firstPlaylist = validPlaylists[0];
        if (firstPlaylist && firstPlaylist.id) {
          this.currentPlaylistId = firstPlaylist.id;
          console.log('DataManager: 设置当前歌单:', this.currentPlaylistId);
        } else {
          console.warn('⚠️ 第一个播放列表无效，无法设置为当前播放列表');
        }
      }
      
      console.log(`DataManager: 数据加载完成 - 音乐文件: ${this.musicFiles.size}首, 播放列表: ${this.playlists.size}个, 当前歌单: ${this.currentPlaylistId}`);
    } catch (error) {
      console.error('DataManager: 数据加载失败:', error);
      
      // 🔧 修复：Windows平台特殊错误处理
      if (process.platform === 'win32') {
        console.error('Windows平台数据加载详细信息:');
        console.error('  - 数据库状态:', this.db ? '已连接' : '未连接');
        console.error('  - 错误类型:', error instanceof Error ? error.constructor.name : typeof error);
        console.error('  - 错误消息:', error instanceof Error ? error.message : String(error));
      }
      
      throw error;
    }
  }

  // 添加计算总时长的辅助方法
  private calculateTotalDuration(musicIds: string[]): number {
    return musicIds.reduce((total, musicId) => {
      const music = this.musicFiles.get(musicId);
      return total + (music?.duration || 0);
    }, 0);
  }

  // 音乐文件操作
  public getAllMusicFiles(): AudioFile[] {
    return Array.from(this.musicFiles.values());
  }

  public getMusicFile(id: string): AudioFile | undefined {
    return this.musicFiles.get(id);
  }

  public addMusicFile(musicFile: AudioFile, targetPlaylistId?: string): void {
    console.log('🎵 DataManager: 开始添加音乐文件:', musicFile.displayName || musicFile.fileName);
    
    // Windows平台调试信息
    if (process.platform === 'win32') {
      console.log('🪟 Windows平台音乐添加调试:');
      console.log('   - 文件路径:', musicFile.filePath);
      console.log('   - 文件大小:', musicFile.fileSize);
      console.log('   - 当前歌单ID:', this.currentPlaylistId);
      console.log('   - 音乐库大小:', this.musicFiles.size);
    }
    
    try {
      this.musicFiles.set(musicFile.id, musicFile);
      console.log('✅ 音乐文件添加到内存缓存成功');
      
      this.db.saveMusicFile(musicFile);
      console.log('✅ 音乐文件保存到数据库成功');
      
      this.emit('musicFileAdded', musicFile);
    } catch (error) {
      console.error('❌ 音乐文件添加失败:', error);
      throw error;
    }
    
    // 自动添加到指定歌单、当前歌单或默认歌单
    const explicitTargetPlaylistId = targetPlaylistId && this.playlists.has(targetPlaylistId)
      ? targetPlaylistId
      : null;

    if (explicitTargetPlaylistId) {
      console.log('🎵 添加到指定歌单:', explicitTargetPlaylistId);
      this.addMusicToPlaylist(explicitTargetPlaylistId, musicFile.id);
    } else if (this.currentPlaylistId) {
      console.log('🎵 添加到当前歌单:', this.currentPlaylistId);
      this.addMusicToPlaylist(this.currentPlaylistId, musicFile.id);
    } else {
      // 如果没有当前歌单，添加到默认歌单
      const defaultPlaylist = this.getDefaultPlaylist();
      if (defaultPlaylist) {
        console.log('🎵 添加到默认歌单:', defaultPlaylist.id);
        this.addMusicToPlaylist(defaultPlaylist.id, musicFile.id);
      } else {
        console.warn('⚠️  没有找到默认歌单，音乐文件仅保存到总库');
      }
    }
    
    console.log('✅ 音乐文件添加流程完成:', musicFile.displayName);
  }

  public addMusicFiles(musicFiles: AudioFile[]): void {
    console.log('DataManager: 开始添加音乐文件:', musicFiles.length, '个文件');
    
    musicFiles.forEach((music, index) => {
      console.log(`DataManager: 处理文件 ${index + 1}/${musicFiles.length}:`, {
        id: music.id,
        fileName: music.fileName,
        filePath: music.filePath,
        displayName: music.displayName
      });
      
      this.musicFiles.set(music.id, music);
      this.db.saveMusicFile(music);
    });
    
    // 批量添加到当前歌单或默认歌单
    const targetPlaylistId = this.currentPlaylistId || this.ensureDefaultPlaylist().id;
    const musicIds = musicFiles.map(m => m.id);
    
    console.log('DataManager: 目标歌单ID:', targetPlaylistId);
    console.log('DataManager: 音乐ID列表:', musicIds);
    
    if (targetPlaylistId) {
      const playlist = this.playlists.get(targetPlaylistId);
      if (playlist) {
        // 过滤掉已存在的音乐ID
        const newMusicIds = musicIds.filter(id => !playlist.audioFiles.includes(id));
        
        console.log('DataManager: 新音乐ID列表:', newMusicIds);
        
        if (newMusicIds.length > 0) {
          playlist.audioFiles.push(...newMusicIds);
          playlist.songCount = playlist.audioFiles.length;
          playlist.totalDuration = this.calculateTotalDuration(playlist.audioFiles);
          playlist.updatedTime = new Date();
          
          // 批量更新数据库
          newMusicIds.forEach(musicId => {
            this.db.addMusicToPlaylist(targetPlaylistId, musicId);
          });
          
          // 更新播放列表信息
          this.db.updatePlaylist(targetPlaylistId, {
            songCount: playlist.songCount,
            totalDuration: playlist.totalDuration,
            updatedTime: playlist.updatedTime
          });
          
          this.playlists.set(targetPlaylistId, playlist);
          this.emit('playlistUpdated', playlist);
          
          console.log(`${newMusicIds.length} 首音乐已添加到歌单: ${playlist.name} (总数: ${playlist.songCount})`);
        }
      }
    }
    
    this.emit('musicFilesAdded', musicFiles);
    console.log(`${musicFiles.length} 首音乐文件已添加`);
  }

  public updateMusicFile(id: string, updates: Partial<AudioFile>): void {
    const existing = this.musicFiles.get(id);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.musicFiles.set(id, updated);
      this.db.updateMusicFile(id, updates);
      this.emit('musicFileUpdated', updated);
    }
  }

  public deleteMusicFile(id: string): void {
    const music = this.musicFiles.get(id);
    if (music) {
      this.musicFiles.delete(id);
      this.db.deleteMusicFile(id);

      this.playlists.forEach((playlist, playlistId) => {
        const previousLength = playlist.audioFiles.length;
        playlist.audioFiles = playlist.audioFiles.filter(musicId => musicId !== id);
        if (playlist.manualOrder) {
          playlist.manualOrder = playlist.manualOrder.filter(musicId => musicId !== id);
        }

        if (playlist.audioFiles.length !== previousLength) {
          playlist.songCount = playlist.audioFiles.length;
          playlist.totalDuration = this.calculateTotalDuration(playlist.audioFiles);
          playlist.updatedTime = new Date();
          this.playlists.set(playlistId, playlist);
          this.emit('playlistUpdated', playlist);
        }
      });

      this.emit('musicFileDeleted', music);
    }
  }

  public clearAllMusic(): void {
    // @ts-ignore
    if (this.db.clearAllMusic) {
      // @ts-ignore
      this.db.clearAllMusic();
    } else {
      // Fallback for in-memory
      this.musicFiles.clear();
      this.playlists.forEach(p => {
        p.audioFiles = [];
        p.songCount = 0;
        p.totalDuration = 0;
      });
    }
    this.loadData();
    this.emit('dataCleared');
    console.log('所有音乐数据已清除');
  }

  // 播放列表操作
  public getAllPlaylists(): Playlist[] {
    return Array.from(this.playlists.values());
  }

  public getPlaylist(id: string): Playlist | undefined {
    return this.playlists.get(id);
  }

  public createPlaylist(data: Omit<Playlist, 'id' | 'createdTime' | 'updatedTime'>): Playlist {
    console.log('🎵 DataManager: 开始创建歌单:', data.name);
    
    // Windows平台调试信息
    if (process.platform === 'win32') {
      console.log('🪟 Windows平台歌单创建调试:');
      console.log('   - 数据库连接状态:', this.db ? '已连接' : '未连接');
      console.log('   - 当前歌单数量:', this.playlists.size);
    }
    
    const now = new Date();
    const playlist: Playlist = {
      id: uuidv4(),
      createdTime: now,
      updatedTime: now,
      ...data,
      audioFiles: data.audioFiles || [],
      sortOrder: data.sortOrder || 'added_time_desc',
      songCount: data.audioFiles?.length || 0,
      totalDuration: 0
    };
    
    console.log('🎵 歌单数据准备完成:', playlist.id);
    
    try {
      this.db.savePlaylist(playlist);
      console.log('✅ 歌单保存到数据库成功');
      
      this.playlists.set(playlist.id, playlist);
      console.log('✅ 歌单添加到内存缓存成功');
      
      return playlist;
    } catch (dbError) {
      console.error('❌ 数据库保存失败:', dbError);
      throw dbError;
    }
  }

  public updatePlaylist(id: string, updates: Partial<Playlist>): void {
    const existing = this.playlists.get(id);
    if (existing) {
      const updated = { ...existing, ...updates, updatedTime: new Date() };
      this.playlists.set(id, updated);
      this.db.updatePlaylist(id, updates);
      this.emit('playlistUpdated', updated);
    }
  }

  public deletePlaylist(id: string): void {
    const playlist = this.playlists.get(id);
    if (playlist) {
      this.playlists.delete(id);
      this.db.deletePlaylist(id);
      this.emit('playlistDeleted', playlist);
    }
  }

  // 排序相关方法
  public updatePlaylistsOrder(playlistIds: string[]): void {
    // 更新数据库中的排序
    this.db.updatePlaylistsOrder(playlistIds);
    
    // 更新内存中的排序
    playlistIds.forEach((playlistId, index) => {
      const playlist = this.playlists.get(playlistId);
      if (playlist) {
        playlist.displayOrder = index;
        this.playlists.set(playlistId, playlist);
      }
    });
    
    this.emit('playlistsOrderUpdated', playlistIds);
  }

  public updatePlaylistMusicOrder(playlistId: string, musicIds: string[]): void {
    const playlist = this.playlists.get(playlistId);
    if (playlist) {
      // 更新内存中的歌曲顺序
      playlist.audioFiles = musicIds;
      playlist.manualOrder = musicIds;
      playlist.songCount = musicIds.length;
      playlist.totalDuration = this.calculateTotalDuration(musicIds);
      playlist.updatedTime = new Date();
      this.playlists.set(playlistId, playlist);
      
      // 更新数据库中的排序
      this.db.updatePlaylistMusicOrder(playlistId, musicIds);
      
      this.emit('playlistUpdated', playlist);
      this.emit('playlistMusicOrderUpdated', { playlistId, musicIds });
    }
  }

  // 播放列表音乐关联操作
  public addMusicToPlaylist(playlistId: string, musicId: string): void {
    const playlist = this.playlists.get(playlistId);
    const music = this.musicFiles.get(musicId);
    
    if (playlist && music && !playlist.audioFiles.includes(musicId)) {
      // 更新内存状态
      playlist.audioFiles.push(musicId);
      playlist.songCount = playlist.audioFiles.length;
      playlist.totalDuration = this.calculateTotalDuration(playlist.audioFiles);
      
      // 立即更新数据库
      this.db.addMusicToPlaylist(playlistId, musicId);
      this.db.updatePlaylist(playlistId, {
        songCount: playlist.songCount,
        totalDuration: playlist.totalDuration
      });
      
      this.emit('playlistUpdated', playlist);
      this.emit('musicAddedToPlaylist', { playlistId, musicId });
    }
  }

  public removeMusicFromPlaylist(playlistId: string, musicId: string): void {
    const playlist = this.playlists.get(playlistId);
    const music = this.musicFiles.get(musicId);
    
    if (playlist && music) {
      playlist.audioFiles = playlist.audioFiles.filter(id => id !== musicId);
      if (playlist.manualOrder) {
        playlist.manualOrder = playlist.manualOrder.filter(id => id !== musicId);
      }
      playlist.songCount = playlist.audioFiles.length;
      playlist.totalDuration = this.calculateTotalDuration(playlist.audioFiles);
      playlist.updatedTime = new Date();
      
      this.playlists.set(playlistId, playlist);
      this.db.removeMusicFromPlaylist(playlistId, musicId);
      
      // 更新播放列表信息
      this.db.updatePlaylist(playlistId, {
        songCount: playlist.songCount,
        totalDuration: playlist.totalDuration,
        updatedTime: playlist.updatedTime
      });
      
      this.emit('musicRemovedFromPlaylist', { playlistId, musicId, playlist });
      console.log(`音乐已从歌单移除: ${music.displayName} -> ${playlist.name} (剩余: ${playlist.songCount})`);
    }
  }

  public getPlaylistMusic(playlistId: string): AudioFile[] {
    const playlist = this.playlists.get(playlistId);
    if (!playlist) return [];

    // 从数据库获取正确排序的音乐列表
    const playlistWithMusic = this.db.getPlaylistWithMusic(playlistId);
    if (!playlistWithMusic) return [];

    // 根据数据库中的排序更新内存中的顺序
    playlist.audioFiles = playlistWithMusic.audioFiles;

    return playlist.audioFiles
      .map(id => this.musicFiles.get(id))
      .filter((music): music is AudioFile => music !== undefined);
  }

  // 批量操作
  public addMusicToPlaylistBatch(playlistId: string, musicIds: string[]): void {
    musicIds.forEach(musicId => {
      this.addMusicToPlaylist(playlistId, musicId);
    });
  }

  public removeMusicFromPlaylistBatch(playlistId: string, musicIds: string[]): void {
    musicIds.forEach(musicId => {
      this.removeMusicFromPlaylist(playlistId, musicId);
    });
  }

  // 获取默认播放列表
  public getDefaultPlaylist(): Playlist | undefined {
    return Array.from(this.playlists.values()).find(p => p.isDefault);
  }

  // 创建默认播放列表（如果不存在）- 增强Windows版本兼容性
  public ensureDefaultPlaylist(): Playlist {
    console.log('DataManager: 开始确保默认歌单存在...');
    let defaultPlaylist = this.getDefaultPlaylist();
    
    if (!defaultPlaylist) {
      console.log('DataManager: 默认歌单不存在，开始创建...');
      try {
        defaultPlaylist = this.createPlaylist({
          name: '所有音乐',
          description: '包含所有音乐文件的默认歌单',
          audioFiles: [],
          isDefault: true,
          sortOrder: 'added_time_desc' as any,
          songCount: 0,
          totalDuration: 0
        });
        
        // 🔧 修复：验证创建结果
        if (!defaultPlaylist || !defaultPlaylist.id || !defaultPlaylist.name) {
          throw new Error('createPlaylist 返回了无效结果');
        }
        
        // 设置默认歌单为当前歌单
        this.currentPlaylistId = defaultPlaylist.id;
        console.log('✅ DataManager: 默认歌单创建成功:', defaultPlaylist.id, defaultPlaylist.name);
        
        // Windows平台额外验证
        if (process.platform === 'win32') {
          console.log('🪟 Windows平台验证默认歌单...');
          const verifyPlaylist = this.getDefaultPlaylist();
          if (!verifyPlaylist) {
            console.error('❌ Windows平台默认歌单验证失败，歌单创建后立即丢失');
            throw new Error('默认歌单创建失败：歌单创建后立即丢失');
          } else {
            console.log('✅ Windows平台默认歌单验证通过');
          }
        }
        
      } catch (error) {
        console.error('❌ DataManager: 创建默认歌单失败:', error);
        
        // Windows系统特别处理：尝试多种创建方式
        if (process.platform === 'win32') {
          console.log('🪟 Windows平台尝试备用方案创建默认歌单...');
          
          // 方案1：使用简化的歌单数据
          try {
            defaultPlaylist = this.createPlaylist({
              name: '默认歌单',
              description: '默认播放列表',
              audioFiles: [],
              isDefault: true,
              sortOrder: 'added_time_desc' as any,
              songCount: 0,
              totalDuration: 0
            });
            
            // 🔧 修复：验证备用方案结果
            if (!defaultPlaylist || !defaultPlaylist.id || !defaultPlaylist.name) {
              throw new Error('备用方案 createPlaylist 也返回了无效结果');
            }
            
            this.currentPlaylistId = defaultPlaylist.id;
            console.log('✅ Windows平台备用方案成功创建默认歌单');
          } catch (fallbackError) {
            console.error('❌ Windows平台备用方案也失败:', fallbackError);
            console.error('数据库状态:', this.db ? '已连接' : '未连接');
            console.error('内存中播放列表数量:', this.playlists.size);
            throw new Error(`Windows平台无法创建默认歌单: ${error instanceof Error ? error.message : '未知错误'}`);
          }
        } else {
          throw error;
        }
      }
    } else {
      console.log('✅ DataManager: 默认歌单已存在:', defaultPlaylist.id, defaultPlaylist.name);
    }
    
    // 🔧 修复：最终安全检查
    if (!defaultPlaylist || !defaultPlaylist.id || !defaultPlaylist.name) {
      const errorMsg = `ensureDefaultPlaylist 最终返回了无效结果: ${JSON.stringify(defaultPlaylist)}`;
      console.error('❌ ', errorMsg);
      throw new Error(errorMsg);
    }
    
    return defaultPlaylist;
  }

  // 设置当前歌单
  public setCurrentPlaylist(playlistId: string): void {
    this.currentPlaylistId = playlistId;
    this.emit('currentPlaylistChanged', playlistId);
  }

  // 获取当前歌单
  public getCurrentPlaylist(): Playlist | null {
    if (!this.currentPlaylistId) return null;
    return this.playlists.get(this.currentPlaylistId) || null;
  }

  // 数据同步
  public syncData(): void {
    this.loadData();
    this.emit('dataSynced');
  }

  // 清理数据
  public clearAllData(): void {
    this.musicFiles.clear();
    this.playlists.clear();
    this.emit('dataCleared');
  }
}

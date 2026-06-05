import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import { AudioFile, Playlist } from '../renderer/types';

export class DatabaseManager {
  private db: Database.Database;
  private static instance: DatabaseManager;

  private constructor() {
    try {
      console.log('=== DatabaseManager 初始化开始 ===');
      console.log('平台信息:', process.platform);
      console.log('架构信息:', process.arch);
      console.log('Node.js 版本:', process.version);
      
      // 创建数据库文件路径
      // 统一使用用户数据目录，确保跨平台兼容性和权限正确
      let userDataPath: string;
      let dbPath: string;
      
      // 优先使用Electron的用户数据目录（始终可写且持久化）
      try {
        userDataPath = app.getPath('userData');
        dbPath = path.join(userDataPath, 'wedding_music.db');
        console.log('DatabaseManager: 使用Electron用户数据目录');
      } catch (error) {
        console.warn('DatabaseManager: 无法获取Electron用户数据目录，使用备用方案');
        // 备用方案：使用系统临时目录下的应用专用文件夹
        const os = require('os');
        const tmpDir = os.tmpdir();
        userDataPath = path.join(tmpDir, 'wedding-music-player');
        dbPath = path.join(userDataPath, 'wedding_music.db');
      }
      
      console.log('DatabaseManager: 初始用户数据路径:', userDataPath);
      console.log('DatabaseManager: 初始数据库路径:', dbPath);
      
      // 确保目录存在，添加Windows权限检查
      const fs = require('fs');
      
      const ensureDir = (dir: string) => {
        if (!fs.existsSync(dir)) {
          console.log('DatabaseManager: 目录不存在，开始创建...', dir);
          fs.mkdirSync(dir, { recursive: true });
          console.log('DatabaseManager: 目录创建成功:', dir);
        }
      };
      
      const assertWritable = (dir: string) => {
        // 测试写权限
        const testFile = path.join(dir, '.test_write_permission');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      };
      
      try {
        ensureDir(userDataPath);
        assertWritable(userDataPath);
        console.log('DatabaseManager: 目录写权限检查通过:', userDataPath);
      } catch (permError: any) {
        console.warn('DatabaseManager: 目录权限检查失败，尝试回退:', permError?.message);
        // Windows 回退到用户数据目录（始终可写）
        const fallbackPath = app.getPath('userData');
        if (fallbackPath !== userDataPath) {
          try {
            ensureDir(fallbackPath);
            assertWritable(fallbackPath);
            userDataPath = fallbackPath;
            dbPath = path.join(userDataPath, 'wedding_music.db');
            console.log('DatabaseManager: 已回退到用户数据目录:', userDataPath);
          } catch (fallbackError: any) {
            console.error('DatabaseManager: 回退目录仍不可写:', fallbackError);
            throw new Error(`用户数据目录权限不足，且回退失败: ${fallbackError.message}`);
          }
        } else {
          throw new Error(`用户数据目录权限不足: ${permError.message}`);
        }
      }
      
      // 检查数据库目录
      const dbDir = path.dirname(dbPath);
      ensureDir(dbDir);
      
      // 检查是否已存在数据库文件
      const dbExists = fs.existsSync(dbPath);
      console.log('DatabaseManager: 数据库文件是否存在:', dbExists);
      
      // 初始化数据库连接
      console.log('DatabaseManager: 开始初始化数据库连接...');
      try {
        this.db = new Database(dbPath, {
          verbose: (message) => console.log('SQLite:', message),
          fileMustExist: false
        });
        console.log('DatabaseManager: 数据库连接成功');
      } catch (dbError: any) {
        console.error('DatabaseManager: 数据库连接失败:', dbError);
        
        // 如果是权限问题，尝试删除现有数据库文件重新创建
        if (dbExists && (dbError.message.includes('permission') || dbError.message.includes('SQLITE_CANTOPEN'))) {
          console.log('DatabaseManager: 尝试删除现有数据库文件重新创建...');
          try {
            fs.unlinkSync(dbPath);
            this.db = new Database(dbPath, {
              verbose: (message) => console.log('SQLite:', message),
              fileMustExist: false
            });
            console.log('DatabaseManager: 重新创建数据库连接成功');
          } catch (retryError: any) {
            console.error('DatabaseManager: 重新创建数据库连接失败:', retryError);
            throw new Error(`数据库连接失败（重试后）: ${retryError.message}`);
          }
        } else {
          throw new Error(`数据库连接失败: ${dbError.message}`);
        }
      }
      
      // 设置数据库选项（Windows优化）
      try {
        console.log('DatabaseManager: 设置数据库选项...');
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('cache_size = 10000');
        this.db.pragma('temp_store = MEMORY');
        
        // Windows特定优化
        if (process.platform === 'win32') {
          this.db.pragma('locking_mode = EXCLUSIVE');
          console.log('DatabaseManager: 应用Windows特定优化设置');
        }
        
        console.log('DatabaseManager: 数据库选项设置完成');
      } catch (pragmaError: any) {
        console.warn('DatabaseManager: 数据库选项设置部分失败:', pragmaError);
        // 不抛出错误，允许继续初始化
      }
      
      // 初始化数据库表
      console.log('DatabaseManager: 开始初始化数据库表...');
      this.initializeTables();
      console.log('DatabaseManager: 数据库表初始化完成');
      
      console.log('=== DatabaseManager 初始化完成 ===');
      
      // Windows特殊诊断信息
      if (process.platform === 'win32') {
        console.log('🪟 Windows平台诊断信息:');
        console.log('   - 进程权限:', process.getuid ? process.getuid() : '未知');
        console.log('   - 数据库路径:', dbPath);
        console.log('   - 数据库文件存在:', fs.existsSync(dbPath));
        
        try {
          const stats = fs.statSync(dbPath);
          console.log('   - 数据库文件大小:', stats.size, 'bytes');
          console.log('   - 最后修改时间:', stats.mtime);
          console.log('   - 文件权限可读:', fs.constants.R_OK);
          console.log('   - 文件权限可写:', fs.constants.W_OK);
          
          // 测试数据库访问权限
          try {
            fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
            console.log('   - ✅ 数据库读写权限正常');
          } catch (accessError) {
            console.log('   - ❌ 数据库读写权限异常:', accessError);
          }
          
        } catch (statsError) {
          console.log('   - 无法获取数据库文件信息:', statsError);
        }
        
        // 检查目录权限
        try {
          fs.accessSync(userDataPath, fs.constants.R_OK | fs.constants.W_OK);
          console.log('   - ✅ 用户数据目录权限正常');
        } catch (dirAccessError) {
          console.log('   - ❌ 用户数据目录权限异常:', dirAccessError);
        }
      }
    } catch (error: any) {
      console.error('=== DatabaseManager 初始化失败 ===');
      console.error('错误详情:', error);
      console.error('错误类型:', error.constructor.name);
      console.error('错误消息:', error.message);
      console.error('错误堆栈:', error.stack);
      throw error;
    }
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private initializeTables(): void {
    try {
      console.log('DatabaseManager: 开始创建数据库表...');
      
      // 创建音乐文件表
      console.log('DatabaseManager: 创建 music_files 表...');
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS music_files (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        artist TEXT,
        album TEXT,
        duration REAL,
        file_size INTEGER,
        format TEXT,
        is_favorite BOOLEAN DEFAULT 0,
        add_time TEXT NOT NULL,
        file_path TEXT,
        file_name TEXT,
        display_name TEXT,
        bitrate INTEGER,
        sample_rate INTEGER,
        last_play_time TEXT,
        play_count INTEGER DEFAULT 0,
        custom_tags TEXT,
        thumbnail_path TEXT,
        is_trimmed BOOLEAN DEFAULT 0
      )
    `);
      console.log('DatabaseManager: music_files 表创建成功');

      // 创建播放列表表
      console.log('DatabaseManager: 创建 playlists 表...');
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_time TEXT NOT NULL,
        updated_time TEXT NOT NULL,
        is_default BOOLEAN DEFAULT 0,
        sort_order TEXT DEFAULT 'added_time_desc',
        cover_color TEXT,
        cover_icon TEXT,
        song_count INTEGER DEFAULT 0,
        total_duration REAL DEFAULT 0,
        sort_by TEXT DEFAULT 'addedTime',
        sort_direction TEXT DEFAULT 'desc',
        manual_order TEXT,
        display_order INTEGER DEFAULT 0
      )
    `);
      console.log('DatabaseManager: playlists 表创建成功');

      // 添加新字段到现有表（如果不存在）
      console.log('DatabaseManager: 检查和添加新字段...');
        try {
        this.db.exec(`ALTER TABLE playlists ADD COLUMN sort_by TEXT DEFAULT 'addedTime'`);
        console.log('DatabaseManager: sort_by 字段添加成功');
      } catch (error) {
        console.log('DatabaseManager: sort_by 字段已存在');
      }
      
      try {
        this.db.exec(`ALTER TABLE playlists ADD COLUMN sort_direction TEXT DEFAULT 'desc'`);
        console.log('DatabaseManager: sort_direction 字段添加成功');
      } catch (error) {
        console.log('DatabaseManager: sort_direction 字段已存在');
      }
      
      try {
        this.db.exec(`ALTER TABLE playlists ADD COLUMN manual_order TEXT`);
        console.log('DatabaseManager: manual_order 字段添加成功');
      } catch (error) {
        console.log('DatabaseManager: manual_order 字段已存在');
      }
      
      try {
        this.db.exec(`ALTER TABLE playlists ADD COLUMN display_order INTEGER DEFAULT 0`);
        console.log('DatabaseManager: display_order 字段添加成功');
      } catch (error) {
        console.log('DatabaseManager: display_order 字段已存在');
      }
      
      try {
        this.db.exec(`ALTER TABLE music_files ADD COLUMN is_trimmed BOOLEAN DEFAULT 0`);
        console.log('DatabaseManager: is_trimmed 字段添加成功');
      } catch (error) {
        console.log('DatabaseManager: is_trimmed 字段已存在');
      }

      // 创建播放列表音乐关联表
      console.log('DatabaseManager: 创建 playlist_music 关联表...');
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS playlist_music (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id TEXT NOT NULL,
        music_id TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        added_time TEXT NOT NULL,
        FOREIGN KEY (playlist_id) REFERENCES playlists (id) ON DELETE CASCADE,
        FOREIGN KEY (music_id) REFERENCES music_files (id) ON DELETE CASCADE,
        UNIQUE(playlist_id, music_id)
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_playlist_music_playlist_id ON playlist_music(playlist_id);
      CREATE INDEX IF NOT EXISTS idx_playlist_music_music_id ON playlist_music(music_id);
      CREATE INDEX IF NOT EXISTS idx_music_files_favorite ON music_files(is_favorite);
      CREATE INDEX IF NOT EXISTS idx_music_files_add_time ON music_files(add_time);
    `);
      console.log('DatabaseManager: playlist_music 关联表创建成功');
      
      console.log('DatabaseManager: 所有数据库表初始化完成');
    } catch (error: any) {
      console.error('DatabaseManager: 数据库表初始化失败:', error);
      throw new Error(`数据库表初始化失败: ${error.message}`);
    }
  }

  // 音乐文件操作
  public saveMusicFile(musicFile: AudioFile): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO music_files (
        id, name, artist, album, duration, file_size, format, is_favorite,
        add_time, file_path, file_name, display_name, bitrate, sample_rate,
        last_play_time, play_count, custom_tags, thumbnail_path, is_trimmed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 标准化文件路径，确保 Windows 路径正确处理
    const normalizedFilePath = musicFile.filePath ? musicFile.filePath.replace(/\\/g, '/') : null;

    stmt.run(
      musicFile.id,
      musicFile.displayName,
      musicFile.artist || null,
      musicFile.album || null,
      musicFile.duration || 0,
      musicFile.fileSize || 0,
      musicFile.format || 'unknown',
      musicFile.isFavorite ? 1 : 0,
      musicFile.addedTime.toISOString(),
      normalizedFilePath,
      musicFile.fileName || null,
      musicFile.displayName,
      musicFile.bitrate || 0,
      musicFile.sampleRate || 0,
      musicFile.lastPlayTime?.toISOString() || null,
      musicFile.playCount || 0,
      JSON.stringify(musicFile.customTags || []),
      musicFile.thumbnailPath || null,
      musicFile.isTrimmed ? 1 : 0
    );
  }

  public getAllMusicFiles(): AudioFile[] {
    const stmt = this.db.prepare('SELECT * FROM music_files ORDER BY add_time DESC');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      filePath: row.file_path ? row.file_path.replace(/\\/g, '/') : row.file_path,
      fileName: row.file_name,
      displayName: row.display_name,
      artist: row.artist,
      album: row.album,
      duration: row.duration,
      fileSize: row.file_size,
      format: row.format,
      bitrate: row.bitrate,
      sampleRate: row.sample_rate,
      addedTime: new Date(row.add_time),
      lastPlayTime: row.last_play_time ? new Date(row.last_play_time) : undefined,
      playCount: row.play_count,
      isFavorite: Boolean(row.is_favorite),
      isTrimmed: Boolean(row.is_trimmed),
      customTags: row.custom_tags ? JSON.parse(row.custom_tags) : [],
      thumbnailPath: row.thumbnail_path
    }));
  }

  public updateMusicFile(id: string, updates: Partial<AudioFile>): void {
    const fields = Object.keys(updates).filter(key => key !== 'id');
    if (fields.length === 0) return;

    const setClause = fields.map(field => {
      const dbField = this.camelToSnakeCase(field);
      return `${dbField} = ?`;
    }).join(', ');

    const values = fields.map(field => {
      const value = (updates as any)[field];
      if (field === 'isFavorite' || field === 'isTrimmed') return value ? 1 : 0;
      if (field === 'addedTime' || field === 'lastPlayTime') return value?.toISOString() || null;
      if (field === 'customTags') return JSON.stringify(value || []);
      return value;
    });

    const stmt = this.db.prepare(`UPDATE music_files SET ${setClause} WHERE id = ?`);
    stmt.run(...values, id);
  }

  public deleteMusicFile(id: string): void {
    const deleteTransaction = this.db.transaction((musicId: string) => {
      const affectedPlaylistRows = this.db.prepare(`
        SELECT DISTINCT playlist_id FROM playlist_music WHERE music_id = ?
      `).all(musicId) as Array<{ playlist_id: string }>;
      const affectedPlaylistIds = new Set(affectedPlaylistRows.map(row => row.playlist_id));

      const playlistsWithManualOrder = this.db.prepare(`
        SELECT id, manual_order FROM playlists WHERE manual_order IS NOT NULL AND manual_order != ''
      `).all() as Array<{ id: string; manual_order: string }>;

      const updateManualOrderStmt = this.db.prepare(`
        UPDATE playlists SET manual_order = ?, updated_time = ? WHERE id = ?
      `);

      for (const playlist of playlistsWithManualOrder) {
        try {
          const manualOrder = JSON.parse(playlist.manual_order || '[]');
          if (Array.isArray(manualOrder) && manualOrder.includes(musicId)) {
            const cleanedOrder = manualOrder.filter((item: string) => item !== musicId);
            updateManualOrderStmt.run(JSON.stringify(cleanedOrder), new Date().toISOString(), playlist.id);
            affectedPlaylistIds.add(playlist.id);
          }
        } catch (error) {
          console.warn('清理手动排序记录失败:', playlist.id, error);
        }
      }

      this.db.prepare('DELETE FROM playlist_music WHERE music_id = ?').run(musicId);
      this.db.prepare('DELETE FROM music_files WHERE id = ?').run(musicId);

      for (const playlistId of affectedPlaylistIds) {
        this.updatePlaylistSongCount(playlistId);
      }
    });

    deleteTransaction(id);
  }

  public clearAllMusic(): void {
    this.db.exec('DELETE FROM music_files');
    this.db.exec('DELETE FROM playlist_music');
    // We might want to reset the default playlist's song count too
    this.db.exec("UPDATE playlists SET song_count = 0, total_duration = 0 WHERE is_default = 1");
  }

  // 播放列表操作
  public savePlaylist(playlist: Playlist): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO playlists (
        id, name, description, created_time, updated_time, is_default,
        sort_order, cover_color, cover_icon, song_count, total_duration,
        sort_by, sort_direction, manual_order, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      playlist.id,
      playlist.name,
      playlist.description || null,
      playlist.createdTime.toISOString(),
      playlist.updatedTime.toISOString(),
      playlist.isDefault ? 1 : 0,
      playlist.sortOrder,
      playlist.coverColor || null,
      playlist.coverIcon || null,
      playlist.songCount || 0,
      playlist.totalDuration || 0,
      playlist.sortBy || 'addedTime',
      playlist.sortDirection || 'desc',
      playlist.manualOrder ? JSON.stringify(playlist.manualOrder) : null,
      playlist.displayOrder || 0
    );
  }

  public getAllPlaylists(): Playlist[] {
    const stmt = this.db.prepare('SELECT * FROM playlists ORDER BY display_order ASC, created_time DESC');
    const rows = stmt.all() as any[];

    return rows.map(row => {
      let manualOrder = row.manual_order ? JSON.parse(row.manual_order) : undefined;
      const sortBy = row.sort_by || 'addedTime';
      const playlistMusicIds = this.getPlaylistMusicIds(row.id);
      
      // 🔧 关键修复：如果是手动排序且有manualOrder，使用manualOrder作为audioFiles
      // 否则使用数据库中按order_index排序的结果
      let audioFiles: string[];
      if (sortBy === 'manual' && manualOrder && manualOrder.length > 0) {
        const existingIdSet = new Set(playlistMusicIds);
        const cleanedManualOrder = manualOrder.filter((musicId: string) => existingIdSet.has(musicId));
        const remainingIds = playlistMusicIds.filter(musicId => !cleanedManualOrder.includes(musicId));
        audioFiles = [...cleanedManualOrder, ...remainingIds];

        if (audioFiles.length !== manualOrder.length || remainingIds.length > 0) {
          console.log(`🔄 播放列表 ${row.name} 清理手动排序: ${manualOrder.length} -> ${audioFiles.length}`);
          manualOrder = audioFiles;
          try {
            this.updatePlaylist(row.id, { manualOrder: audioFiles, songCount: audioFiles.length } as any);
          } catch (error) {
            console.warn('保存清理后的手动排序失败:', row.id, error);
          }
        } else {
          console.log(`🔄 播放列表 ${row.name} 使用手动排序:`, audioFiles.length, '项');
        }
      } else {
        audioFiles = playlistMusicIds;
      }
      
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        audioFiles: audioFiles, // 🎯 使用正确的排序
        createdTime: new Date(row.created_time),
        updatedTime: new Date(row.updated_time),
        isDefault: Boolean(row.is_default),
        sortOrder: row.sort_order,
        coverColor: row.cover_color,
        coverIcon: row.cover_icon,
        songCount: audioFiles.length,
        totalDuration: 0,
        sortBy: sortBy,
        sortDirection: row.sort_direction || 'desc',
        manualOrder: manualOrder,
        displayOrder: row.display_order || 0
      };
    });
  }

  public getPlaylistWithMusic(playlistId: string): Playlist | null {
    const playlistStmt = this.db.prepare('SELECT * FROM playlists WHERE id = ?');
    const playlistRow = playlistStmt.get(playlistId) as any;

    if (!playlistRow) return null;

    const musicStmt = this.db.prepare(`
      SELECT mf.*, pm.order_index FROM music_files mf
      JOIN playlist_music pm ON mf.id = pm.music_id
      WHERE pm.playlist_id = ?
      ORDER BY pm.order_index ASC, pm.added_time ASC
    `);
    const musicRows = musicStmt.all(playlistId) as any[];

    const audioFiles = musicRows.map(row => ({
      id: row.id,
      filePath: row.file_path ? row.file_path.replace(/\\/g, '/') : row.file_path,
      fileName: row.file_name,
      displayName: row.display_name,
      artist: row.artist,
      album: row.album,
      duration: row.duration,
      fileSize: row.file_size,
      format: row.format,
      bitrate: row.bitrate,
      sampleRate: row.sample_rate,
      addedTime: new Date(row.add_time),
      lastPlayTime: row.last_play_time ? new Date(row.last_play_time) : undefined,
      playCount: row.play_count,
      isFavorite: Boolean(row.is_favorite),
      isTrimmed: Boolean(row.is_trimmed),
      customTags: row.custom_tags ? JSON.parse(row.custom_tags) : [],
      thumbnailPath: row.thumbnail_path
    }));

    return {
      id: playlistRow.id,
      name: playlistRow.name,
      description: playlistRow.description,
      audioFiles: audioFiles.map(mf => mf.id),
      createdTime: new Date(playlistRow.created_time),
      updatedTime: new Date(playlistRow.updated_time),
      isDefault: Boolean(playlistRow.is_default),
      sortOrder: playlistRow.sort_order,
      coverColor: playlistRow.cover_color,
      coverIcon: playlistRow.cover_icon,
      songCount: playlistRow.song_count,
      totalDuration: playlistRow.total_duration,
      sortBy: playlistRow.sort_by || 'addedTime',
      sortDirection: playlistRow.sort_direction || 'desc',
      manualOrder: playlistRow.manual_order ? JSON.parse(playlistRow.manual_order) : undefined,
      displayOrder: playlistRow.display_order || 0
    };
  }

  public updatePlaylist(id: string, updates: Partial<Playlist>): void {
    const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'audioFiles');
    if (fields.length === 0) return;

    const setClause = fields.map(field => {
      const dbField = this.camelToSnakeCase(field);
      return `${dbField} = ?`;
    }).join(', ');

    const values = fields.map(field => {
      const value = (updates as any)[field];
      if (field === 'isDefault') return value ? 1 : 0;
      if (field === 'createdTime' || field === 'updatedTime') return value?.toISOString() || null;
      // 🔧 关键修复：manualOrder需要序列化为JSON字符串
      if (field === 'manualOrder') return value ? JSON.stringify(value) : null;
      return value;
    });

    const stmt = this.db.prepare(`UPDATE playlists SET ${setClause} WHERE id = ?`);
    stmt.run(...values, id);
  }

  public deletePlaylist(id: string): void {
    const stmt = this.db.prepare('DELETE FROM playlists WHERE id = ?');
    stmt.run(id);
  }

  // 播放列表音乐关联操作
  public addMusicToPlaylist(playlistId: string, musicId: string): void {
    // 获取当前播放列表中的最大order_index
    const maxOrderStmt = this.db.prepare(`
      SELECT COALESCE(MAX(order_index), -1) as max_order FROM playlist_music WHERE playlist_id = ?
    `);
    const maxOrderResult = maxOrderStmt.get(playlistId) as { max_order: number };
    const nextOrder = maxOrderResult.max_order + 1;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO playlist_music (playlist_id, music_id, order_index, added_time)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(playlistId, musicId, nextOrder, new Date().toISOString());

    // 更新播放列表的歌曲数量
    this.updatePlaylistSongCount(playlistId);
  }

  public removeMusicFromPlaylist(playlistId: string, musicId: string): void {
    const stmt = this.db.prepare('DELETE FROM playlist_music WHERE playlist_id = ? AND music_id = ?');
    stmt.run(playlistId, musicId);

    const playlist = this.db.prepare('SELECT manual_order FROM playlists WHERE id = ?').get(playlistId) as { manual_order?: string } | undefined;
    if (playlist?.manual_order) {
      try {
        const manualOrder = JSON.parse(playlist.manual_order);
        if (Array.isArray(manualOrder) && manualOrder.includes(musicId)) {
          const cleanedOrder = manualOrder.filter((item: string) => item !== musicId);
          this.db.prepare('UPDATE playlists SET manual_order = ?, updated_time = ? WHERE id = ?')
            .run(JSON.stringify(cleanedOrder), new Date().toISOString(), playlistId);
        }
      } catch (error) {
        console.warn('从歌单移除音乐时清理手动排序失败:', playlistId, error);
      }
    }

    // 更新播放列表的歌曲数量
    this.updatePlaylistSongCount(playlistId);
  }

  public getPlaylistMusicIds(playlistId: string): string[] {
    const stmt = this.db.prepare(`
      SELECT music_id FROM playlist_music 
      WHERE playlist_id = ? 
      ORDER BY order_index, added_time
    `);
    const rows = stmt.all(playlistId) as any[];
    return rows.map(row => row.music_id);
  }

  public updatePlaylistSongCount(playlistId: string): void {
    const statsStmt = this.db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(mf.duration), 0) as totalDuration
      FROM playlist_music pm
      JOIN music_files mf ON mf.id = pm.music_id
      WHERE pm.playlist_id = ?
    `);
    const result = statsStmt.get(playlistId) as { count: number; totalDuration: number };
    const count = result.count;
    
    const updateStmt = this.db.prepare(`
      UPDATE playlists SET song_count = ?, total_duration = ?, updated_time = ? WHERE id = ?
    `);
    updateStmt.run(count, result.totalDuration || 0, new Date().toISOString(), playlistId);
  }

  // 更新歌单排序
  public updatePlaylistsOrder(playlistIds: string[]): void {
    const stmt = this.db.prepare('UPDATE playlists SET display_order = ? WHERE id = ?');
    
    playlistIds.forEach((playlistId, index) => {
      stmt.run(index, playlistId);
    });
  }

  // 更新歌单内歌曲排序
  public updatePlaylistMusicOrder(playlistId: string, musicIds: string[]): void {
    const uniqueInputIds = Array.from(new Set(musicIds.filter(Boolean)));
    const musicExistsStmt = this.db.prepare('SELECT 1 FROM music_files WHERE id = ?');
    const validInputIds = uniqueInputIds.filter(musicId => Boolean(musicExistsStmt.get(musicId)));

    const existingRows = this.db.prepare(`
      SELECT pm.music_id
      FROM playlist_music pm
      JOIN music_files mf ON mf.id = pm.music_id
      WHERE pm.playlist_id = ?
      ORDER BY pm.order_index ASC, pm.added_time ASC
    `).all(playlistId) as Array<{ music_id: string }>;

    const inputIdSet = new Set(validInputIds);
    const completeOrder = [
      ...validInputIds,
      ...existingRows.map(row => row.music_id).filter(musicId => !inputIdSet.has(musicId))
    ];

    const saveOrder = this.db.transaction((orderedIds: string[]) => {
      const now = new Date().toISOString();
      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO playlist_music (playlist_id, music_id, order_index, added_time)
        VALUES (?, ?, ?, ?)
      `);
      const updateOrderStmt = this.db.prepare(`
        UPDATE playlist_music
        SET order_index = ?
        WHERE playlist_id = ? AND music_id = ?
      `);

      orderedIds.forEach((musicId, index) => {
        insertStmt.run(playlistId, musicId, index, now);
        updateOrderStmt.run(index, playlistId, musicId);
      });

      const stats = this.db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(mf.duration), 0) as totalDuration
        FROM playlist_music pm
        JOIN music_files mf ON mf.id = pm.music_id
        WHERE pm.playlist_id = ?
      `).get(playlistId) as { count: number; totalDuration: number };

      const updatePlaylistStmt = this.db.prepare(`
        UPDATE playlists
        SET sort_by = ?, sort_direction = ?, manual_order = ?, song_count = ?, total_duration = ?, updated_time = ?
        WHERE id = ?
      `);
      updatePlaylistStmt.run(
        'manual',
        'desc',
        JSON.stringify(orderedIds),
        stats.count,
        stats.totalDuration || 0,
        now,
        playlistId
      );
    });

    saveOrder(completeOrder);
  }

  private camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  public close(): void {
    this.db.close();
  }
}

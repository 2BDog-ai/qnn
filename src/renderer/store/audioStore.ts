import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  AudioFile, 
  Playlist, 
  PlaybackState, 
  PlayMode, 
  SortOrder,
  AppModule 
} from '../types';

// 类型断言辅助函数
const getMusicAPI = () => (window as any).electronAPI?.music;

interface AudioState {
  // 播放状态
  playbackState: PlaybackState;
  currentAudio: AudioFile | null;
  currentPlaylist: Playlist | null;
  currentPlaylistId: string | null;
  
  // 音乐库
  audioFiles: AudioFile[];
  playlists: Playlist[];
  
  // UI状态
  activeModule: AppModule;
  isLoading: boolean;
  error: string | null;
  
  // 操作方法
  actions: {
    // 播放控制
    play: (audioFile: AudioFile) => void;
    pause: () => void;
    stop: () => void;
    seek: (time: number) => void;
    setVolume: (volume: number) => void;
    fadeIn: (duration: number) => void;
    fadeOut: (duration: number) => void;
    next: () => void;
    previous: () => void;
    setPlayMode: (mode: PlayMode) => void;
    toggleMute: () => void;
    
    // 音乐库管理
    importAudioFiles: (files: File[]) => Promise<void>;
    updateAudioFile: (id: string, updates: Partial<AudioFile>) => void;
    deleteAudioFile: (id: string) => void;
    toggleFavorite: (id: string) => void;
    
    // 播放列表管理
    createPlaylist: (name: string, description?: string) => void;
    updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
    deletePlaylist: (id: string) => void;
    addToPlaylist: (playlistId: string, audioFileIds: string[]) => void;
    removeFromPlaylist: (playlistId: string, audioFileIds: string[]) => void;
    reorderPlaylist: (playlistId: string, fromIndex: number, toIndex: number) => void;
    setCurrentPlaylist: (playlistId: string) => void;
    loadPlaylistMusic: (playlistId: string) => void;
    loadAllMusic: () => Promise<void>;
    getPlaylistMusic: (playlistId: string) => AudioFile[];
    
    // UI状态
    setActiveModule: (module: AppModule) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    
    // 排序和搜索
    sortAudioFiles: (sortOrder: SortOrder) => void;
    searchAudioFiles: (query: string) => void;
  };
}

export const useAudioStore = create<AudioState>()(
  subscribeWithSelector((set, get) => ({
    // 初始状态
    playbackState: {
      currentAudioId: undefined,
      currentPlaylistId: '',
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
      volume: 0.7,
      playMode: PlayMode.NORMAL,
      isMuted: false,
      fadeInDuration: 2,
      fadeOutDuration: 2
    },
    currentAudio: null,
    currentPlaylist: null,
    currentPlaylistId: null,
    audioFiles: [],
    playlists: [],
    activeModule: '音乐播放',
    isLoading: false,
    error: null,
    
    actions: {
      // 播放控制
      play: (audioFile) => {
        const musicAPI = getMusicAPI();
        if (musicAPI) {
          musicAPI.play(audioFile.filePath);
        }
        set(state => ({
          currentAudio: audioFile,
          playbackState: { 
            ...state.playbackState, 
            currentAudioId: audioFile.id,
            isPlaying: true, 
            isPaused: false 
          }
        }));
      },
      
      pause: () => {
        set(state => ({
          playbackState: { 
            ...state.playbackState, 
            isPlaying: false, 
            isPaused: true 
          }
        }));
      },
      
      stop: () => {
        set(state => ({
          playbackState: { 
            ...state.playbackState, 
            isPlaying: false, 
            isPaused: false,
            currentTime: 0
          }
        }));
      },
      
      seek: (time) => {
        set(state => ({
          playbackState: { 
            ...state.playbackState, 
            currentTime: time 
          }
        }));
      },
      
      setVolume: (volume) => {
        set(state => ({
          playbackState: { 
            ...state.playbackState, 
            volume: Math.max(0, Math.min(1, volume))
          }
        }));
      },
      
      fadeIn: (duration) => {
        set(state => ({
          playbackState: { 
            ...state.playbackState, 
            fadeInDuration: duration 
          }
        }));
      },
      
      fadeOut: (duration) => {
        set(state => ({
          playbackState: { 
            ...state.playbackState, 
            fadeOutDuration: duration 
          }
        }));
      },
      
      next: () => {
        const state = get();
        if (!state.currentPlaylist || state.audioFiles.length === 0) return;
        
        const currentIndex = state.audioFiles.findIndex(
          file => file.id === state.currentAudio?.id
        );
        
        if (currentIndex < state.audioFiles.length - 1) {
          const nextAudio = state.audioFiles[currentIndex + 1];
          state.actions.play(nextAudio);
        }
      },
      
      previous: () => {
        const state = get();
        if (!state.currentPlaylist || state.audioFiles.length === 0) return;
        
        const currentIndex = state.audioFiles.findIndex(
          file => file.id === state.currentAudio?.id
        );
        
        if (currentIndex > 0) {
          const prevAudio = state.audioFiles[currentIndex - 1];
          state.actions.play(prevAudio);
        }
      },
      
      setPlayMode: (mode) => {
        set(state => ({
          playbackState: { 
            ...state.playbackState, 
            playMode: mode 
          }
        }));
      },
      
      toggleMute: () => {
        set(state => ({
          playbackState: { 
            ...state.playbackState, 
            isMuted: !state.playbackState.isMuted 
          }
        }));
      },
      
      // 音乐库管理
      importAudioFiles: async (files) => {
        set({ isLoading: true, error: null });
        
        try {
          const musicAPI = getMusicAPI();
          if (!musicAPI) {
            throw new Error('音乐API不可用');
          }

          console.log('=== 开始导入音乐文件 ===');
          console.log('文件数量:', files.length);
          console.log('音乐API可用性:', !!musicAPI);
          console.log('平台信息:', navigator.platform);

          // 转换File对象为AudioFile格式
          const musicFilesToAdd: AudioFile[] = [];
          const failedFiles: { name: string; error: string }[] = [];
          
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`\n--- 处理文件 ${i + 1}/${files.length}: ${file.name} ---`);
            
            try {
              // 检查文件路径获取
              let filePath = (file as any).path;
              console.log('File对象原始path属性:', filePath);
              console.log('File对象webkitRelativePath:', (file as any).webkitRelativePath);
              console.log('File对象size:', file.size);
              console.log('File对象type:', file.type);
              
              if (!filePath && (file as any).webkitRelativePath) {
                filePath = (file as any).webkitRelativePath;
                console.log('使用webkitRelativePath作为路径:', filePath);
              }
              
              if (!filePath) {
                const errorMsg = `文件 ${file.name} 缺少完整路径信息`;
                console.error(errorMsg);
                failedFiles.push({ name: file.name, error: errorMsg });
                continue;
              }

              // 验证文件存在性（如果是完整路径）
              if (filePath.includes('/') || filePath.includes('\\')) {
                try {
                  if (window.electronAPI?.fs?.exists) {
                    const exists = await window.electronAPI.fs.exists(filePath);
                    console.log('文件存在性检查:', filePath, exists);
                    if (!exists) {
                      const errorMsg = `文件不存在: ${filePath}`;
                      console.error(errorMsg);
                      failedFiles.push({ name: file.name, error: errorMsg });
                      continue;
                    }
                  }
                } catch (existsError) {
                  console.warn('无法检查文件存在性:', existsError);
                }
              }

              // 标准化路径，确保 Windows 路径正确处理
              const originalPath = filePath;
              filePath = filePath.replace(/\\/g, '/');
              console.log('路径标准化:', originalPath, '->', filePath);

              const musicFile: AudioFile = {
                id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                filePath: filePath,
                fileName: file.name,
                displayName: file.name.replace(/\.[^/.]+$/, ''),
                artist: '',
                album: '',
                duration: 0,
                fileSize: file.size,
                format: file.name.split('.').pop()?.toLowerCase() || '',
                bitrate: 0,
                sampleRate: 0,
                addedTime: new Date(),
                playCount: 0,
                isFavorite: false,
                customTags: []
              };
              
              console.log('创建的AudioFile对象:', {
                id: musicFile.id,
                filePath: musicFile.filePath,
                fileName: musicFile.fileName,
                fileSize: musicFile.fileSize
              });
              
              musicFilesToAdd.push(musicFile);
            } catch (fileError) {
              const errorMsg = `处理文件 ${file.name} 时出错: ${fileError}`;
              console.error(errorMsg, fileError);
              failedFiles.push({ name: file.name, error: errorMsg });
            }
          }

          console.log('\n=== 文件处理结果 ===');
          console.log('成功处理的文件数:', musicFilesToAdd.length);
          console.log('失败的文件数:', failedFiles.length);
          
          if (failedFiles.length > 0) {
            console.log('失败的文件列表:', failedFiles);
          }

          if (musicFilesToAdd.length === 0) {
            throw new Error('没有可导入的文件，请检查文件路径和格式');
          }

          console.log('\n=== 开始批量添加到数据库 ===');
          // 调用主进程API批量添加
          const result = await musicAPI.addBatch(musicFilesToAdd);
          console.log('批量添加API调用结果:', result);

          if (!result.success) {
            throw new Error(`数据库添加失败: ${result.error || '未知错误'}`);
          }

          console.log('\n=== 重新加载数据 ===');
          // 重新加载所有音乐文件和歌单数据
          const [updatedMusic, updatedPlaylists] = await Promise.all([
            musicAPI.getAll(),
            musicAPI.playlists.getAll()
          ]);

          console.log('重新加载完成 - 音乐文件数:', updatedMusic.length, '歌单数:', updatedPlaylists.length);

          set(state => ({
            audioFiles: updatedMusic,
            playlists: updatedPlaylists,
            isLoading: false
          }));

          const successMessage = `成功导入 ${musicFilesToAdd.length} 首音乐${failedFiles.length > 0 ? `, ${failedFiles.length} 个文件导入失败` : ''}`;
          console.log('=== 导入完成 ===');
          console.log(successMessage);
          
          // 如果有失败的文件，显示警告
          if (failedFiles.length > 0) {
            set({ error: `部分文件导入失败: ${failedFiles.map(f => f.name).join(', ')}` });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '导入失败';
          console.error('=== 导入音乐文件失败 ===');
          console.error('错误详情:', error);
          console.error('错误堆栈:', error instanceof Error ? error.stack : 'N/A');
          
          set({ 
            error: errorMessage, 
            isLoading: false 
          });
        }
      },
      
      updateAudioFile: (id, updates) => {
        set(state => ({
          audioFiles: state.audioFiles.map(file =>
            file.id === id ? { ...file, ...updates } : file
          )
        }));
      },
      
      deleteAudioFile: (id) => {
        set(state => ({
          audioFiles: state.audioFiles.filter(file => file.id !== id)
        }));
      },
      
      toggleFavorite: (id) => {
        set(state => ({
          audioFiles: state.audioFiles.map(file =>
            file.id === id ? { ...file, isFavorite: !file.isFavorite } : file
          )
        }));
      },
      
      // 播放列表管理
      createPlaylist: (name, description = '') => {
        // 调用主进程API创建歌单
        const musicAPI = getMusicAPI();
        if (musicAPI && musicAPI.playlists) {
          musicAPI.playlists.create({ name, description }).then((newPlaylist: Playlist) => {
            set(state => ({
              playlists: [...state.playlists, newPlaylist],
              currentPlaylist: newPlaylist,
              currentPlaylistId: newPlaylist.id
            }));
          }).catch((error: Error) => {
            set({ error: error.message });
          });
        } else {
          // 降级处理：本地创建
          const newPlaylist: Playlist = {
            id: `playlist_${Date.now()}`,
            name,
            description,
            audioFiles: [],
            createdTime: new Date(),
            updatedTime: new Date(),
            isDefault: false,
            sortOrder: SortOrder.ADDED_TIME_DESC
          };
          
          set(state => ({
            playlists: [...state.playlists, newPlaylist],
            currentPlaylist: newPlaylist,
            currentPlaylistId: newPlaylist.id
          }));
        }
      },
      
      updatePlaylist: (id: string, updates: Partial<Playlist>) => {
        set(state => ({
          playlists: state.playlists.map(playlist =>
            playlist.id === id 
              ? { ...playlist, ...updates, updatedTime: new Date() }
              : playlist
          )
        }));
      },
      
      deletePlaylist: (id) => {
        set(state => ({
          playlists: state.playlists.filter(playlist => playlist.id !== id)
        }));
      },
      
      addToPlaylist: (playlistId, audioFileIds) => {
        // 调用主进程API添加歌曲到歌单
        const musicAPI = getMusicAPI();
        if (musicAPI && musicAPI.playlists) {
          audioFileIds.forEach(musicId => {
            musicAPI.playlists.addMusic(playlistId, musicId).then(() => {
              // 更新本地状态
              set(state => ({
                playlists: state.playlists.map(playlist =>
                  playlist.id === playlistId
                    ? {
                        ...playlist,
                        audioFiles: [...playlist.audioFiles, musicId],
                        updatedTime: new Date()
                      }
                    : playlist
                )
              }));
            }).catch((error: Error) => {
              set({ error: error.message });
            });
          });
        } else {
          // 降级处理：本地更新
          set(state => ({
            playlists: state.playlists.map(playlist =>
              playlist.id === playlistId
                ? {
                    ...playlist,
                    audioFiles: [...playlist.audioFiles, ...audioFileIds],
                    updatedTime: new Date()
                  }
                : playlist
            )
          }));
        }
      },
      
      removeFromPlaylist: (playlistId, audioFileIds) => {
        set(state => ({
          playlists: state.playlists.map(playlist =>
            playlist.id === playlistId
              ? {
                  ...playlist,
                  audioFiles: playlist.audioFiles.filter(id => !audioFileIds.includes(id)),
                  updatedTime: new Date()
                }
              : playlist
          )
        }));
      },
      
      reorderPlaylist: (playlistId, fromIndex, toIndex) => {
        set(state => ({
          playlists: state.playlists.map(playlist =>
            playlist.id === playlistId
              ? {
                  ...playlist,
                  audioFiles: (() => {
                    const newOrder = [...playlist.audioFiles];
                    const [removed] = newOrder.splice(fromIndex, 1);
                    newOrder.splice(toIndex, 0, removed);
                    return newOrder;
                  })(),
                  updatedTime: new Date()
                }
              : playlist
          )
        }));
      },

      setCurrentPlaylist: (playlistId) => {
        const state = get();
        const playlist = state.playlists.find(p => p.id === playlistId);
        if (playlist) {
          // 通知主进程设置当前歌单
          const musicAPI = getMusicAPI();
          if (musicAPI && musicAPI.playlists) {
            musicAPI.playlists.setCurrent(playlistId);
          }
          
          set({
            currentPlaylist: playlist,
            currentPlaylistId: playlistId
            // 不要过滤audioFiles，保持主页显示所有音乐
          });
        }
      },

      loadPlaylistMusic: (playlistId) => {
        const state = get();
        const playlist = state.playlists.find(p => p.id === playlistId);
        if (playlist) {
          // 这个方法专门用于歌单详情页面，会过滤显示的音乐
          const playlistMusic = state.audioFiles.filter(audio => 
            playlist.audioFiles.includes(audio.id)
          );
          set({
            currentPlaylist: playlist,
            currentPlaylistId: playlistId,
            audioFiles: playlistMusic
          });
        }
      },

      // 获取所有音乐（用于主页显示）
      loadAllMusic: async () => {
        try {
          const musicAPI = getMusicAPI();
          if (musicAPI) {
            const allMusic = await musicAPI.getAll();
            const allPlaylists = await musicAPI.playlists.getAll();
            set({
              audioFiles: allMusic,
              playlists: allPlaylists
            });
          }
        } catch (error) {
          set({ error: error instanceof Error ? error.message : '加载音乐失败' });
        }
      },

      // 获取特定歌单的音乐（不改变全局audioFiles状态）
      getPlaylistMusic: (playlistId: string): AudioFile[] => {
        const state = get();
        const playlist = state.playlists.find(p => p.id === playlistId);
        if (!playlist) return [];
        
        return state.audioFiles.filter(audio => 
          playlist.audioFiles.includes(audio.id)
        );
      },
      
      // UI状态
      setActiveModule: (module) => {
        set({ activeModule: module });
      },
      
      setLoading: (loading) => {
        set({ isLoading: loading });
      },
      
      setError: (error) => {
        set({ error });
      },
      
      // 排序和搜索
      sortAudioFiles: (sortOrder) => {
        const state = get();
        const sortedFiles = [...state.audioFiles];
        
        switch (sortOrder) {
          case SortOrder.NAME_ASC:
            sortedFiles.sort((a, b) => a.displayName.localeCompare(b.displayName));
            break;
          case SortOrder.NAME_DESC:
            sortedFiles.sort((a, b) => b.displayName.localeCompare(a.displayName));
            break;
          case SortOrder.DURATION_ASC:
            sortedFiles.sort((a, b) => a.duration - b.duration);
            break;
          case SortOrder.DURATION_DESC:
            sortedFiles.sort((a, b) => b.duration - a.duration);
            break;
          case SortOrder.ADDED_TIME_ASC:
            sortedFiles.sort((a, b) => a.addedTime.getTime() - b.addedTime.getTime());
            break;
          case SortOrder.ADDED_TIME_DESC:
            sortedFiles.sort((a, b) => b.addedTime.getTime() - a.addedTime.getTime());
            break;
        }
        
        set({ audioFiles: sortedFiles });
      },
      
      searchAudioFiles: (query) => {
        const state = get();
        if (!query.trim()) {
          // 如果搜索查询为空，恢复所有音频文件
          return;
        }
        
        const searchTerm = query.toLowerCase().trim();
        const filteredFiles = state.audioFiles.filter(file => 
          file.displayName.toLowerCase().includes(searchTerm) ||
          file.fileName.toLowerCase().includes(searchTerm) ||
          file.artist.toLowerCase().includes(searchTerm) ||
          file.album.toLowerCase().includes(searchTerm) ||
          file.customTags.some(tag => tag.toLowerCase().includes(searchTerm))
        );
        
        // 这里可以选择更新状态或返回结果
        // 为了不影响原始数据，我们可以添加一个搜索结果状态
        console.log(`搜索"${query}"找到${filteredFiles.length}个结果`);
        return filteredFiles;
      }
    }
  }))
);


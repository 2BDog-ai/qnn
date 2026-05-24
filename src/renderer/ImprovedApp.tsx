import React, { useState, useRef, useEffect, Fragment, useMemo } from 'react';
import { TopNavigation } from './components/TopNavigation';
import FavoritesNotesModule from './components/FavoritesNotesModule';
import { ImprovedSidebar } from './components/ImprovedSidebar';
import { ImprovedMusicList } from './components/ImprovedMusicList';
import { ImprovedPlayerControl } from './components/ImprovedPlayerControl';
import { ImprovedFileImport } from './components/ImprovedFileImport';
import { ConsoleRecordingControl } from './components/ConsoleRecordingControl';
import { ConsoleRecordingModal } from './components/ConsoleRecordingModal';
import { EnhancedMusicConverter } from './components/EnhancedMusicConverter';
import { VocalRemover } from './components/VocalRemover';
import { AudioEditor } from './components/AudioEditor';
import { PlaylistCreateModal } from './components/PlaylistCreateModal';
import { NotificationSystem, useNotifications } from './components/NotificationSystem';
import { Playlist, SortOrder } from './types';
import { readAudioMetadata } from './utils/audioMetadata';
import { Dialog, Transition } from '@headlessui/react';
// import Store from 'electron-store'; // Remove this

// @ts-ignore
// import CryptoJS from 'crypto-js'; // Remove this
// 移除 import { MoonIcon, SunIcon } from './components/icons/AudioIcons';
import { ShareIcon, CheckCircleIcon } from './components/icons/AudioIcons';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ReactCrop, { Crop, PixelCrop, PercentCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
// Remove import * as fs from 'fs';
// Remove import { ipcRenderer } from 'electron';

export interface MusicFile {
  id: string;
  name: string;
  artist?: string;
  album?: string;
  duration?: number;
  fileSize: number;
  format: string;
  isPlaying: boolean;
  isFavorite: boolean;
  isTrimmed: boolean;
  addedTime: Date;
  url: string;
  file: File;
  // 数据库字段
  filePath?: string;
  fileName?: string;
  displayName?: string;
  bitrate?: number;
  sampleRate?: number;
  lastPlayTime?: Date;
  playCount?: number;
  customTags?: string[];
  thumbnailPath?: string;
}

// 将本地文件路径转换为安全的 file:// URL，避免 #、空格等特殊字符导致的解析错误
const filePathToFileURL = (filePath: string): string => {
  if (!filePath) return '';

  // 标准化路径，确保 Windows 路径正确处理
  const normalizedPath = filePath.replace(/\\/g, '/');

  // 对每个路径段做 encodeURIComponent，但保留斜杠
  const segments = normalizedPath.split('/');

  // Windows 路径处理：C:/path -> file:///C:/path
  // macOS/Linux 路径处理：/path -> file:///path
  if (normalizedPath.match(/^[A-Za-z]:/)) {
    // Windows: 第一段是盘符如 "C:"，不能编码冒号
    const driveLetter = segments[0]; // "C:" 保持原样
    const rest = segments.slice(1).map(seg => encodeURIComponent(seg)).join('/');
    return `file:///${driveLetter}/${rest}`;
  } else {
    const encoded = segments.map(seg => encodeURIComponent(seg)).join('/');
    return `file://${normalizedPath.startsWith('/') ? '' : '/'}${encoded}`;
  }
};

function ImprovedApp() {
  
  // 基础状态
  const [activeModule, setActiveModule] = useState('music-playback');
  const [activeView, setActiveView] = useState(''); // 初始为空，等待默认歌单加载
  const [audioEditorMusicId, setAudioEditorMusicId] = useState<string | null>(null); 
  const [audioEditorPlaylistId, setAudioEditorPlaylistId] = useState<string | null>(null);
  const [isOverlapEnabled, setIsOverlapEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('wedding-music-player-overlap-enabled');
      return saved !== null ? JSON.parse(saved) : true;
    } catch (error) {
      console.warn('无法读取歌曲重叠设置:', error);
      return true;
    }
  });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    try {
      const saved = localStorage.getItem('wedding-music-player-view-mode');
      return (saved === 'grid' || saved === 'list') ? saved : 'list';
    } catch (error) {
      console.warn('无法读取保存的视图模式:', error);
      return 'list';
    }
  });

  const parseAudioEditorHash = (hash: string) => {
    const route = hash.replace(/^#\/audio-editor\/?/, '');
    const [encodedMusicId, query = ''] = route.split('?');
    const params = new URLSearchParams(query);
    return {
      musicId: encodedMusicId ? decodeURIComponent(encodedMusicId) : null,
      playlistId: params.get('playlistId')
    };
  };

  // 播放列表级别的排序状态管理
  const [playlistSortStates, setPlaylistSortStates] = useState<Record<string, {
    sortBy: 'name' | 'artist' | 'duration' | 'addedTime' | 'manual';
    sortDirection: 'asc' | 'desc';
    manualOrder?: string[];
  }>>({});

  // 手动排序模式状态
  const [isManualSortMode, setIsManualSortMode] = useState(false);
  const [manualSortOriginalState, setManualSortOriginalState] = useState<{
    sortBy: string;
    sortDirection: string;
    manualOrder?: string[];
  } | null>(null);

  // 获取当前活动视图的排序状态
  const getCurrentSortState = () => {
    const currentId = activeView.startsWith('playlist-') ? activeView.replace('playlist-', '') : 'all-music';
    
    // 如果在手动排序模式，返回手动排序状态
    if (isManualSortMode) {
      const state = {
        sortBy: 'manual' as const,
        sortDirection: 'desc' as const,
        manualOrder: playlistSortStates[currentId]?.manualOrder
      };
      console.log(`🔍 手动排序模式 - 视图: ${activeView}, ID: ${currentId}, 状态:`, state);
      return state;
    }
    
    // 获取保存的排序状态，如果没有则使用默认排序（按添加时间降序）
    const state = playlistSortStates[currentId];
    if (!state) {
      console.log(`⚠️ 视图 ${activeView} (${currentId}) 没有保存的排序状态，使用默认排序（添加时间降序）`);
      return {
        sortBy: 'addedTime' as const,
        sortDirection: 'desc' as const
      };
    }
    
    // 如果是手动排序状态，确保有manualOrder数据
    if (state.sortBy === 'manual' && !state.manualOrder) {
      console.log(`⚠️ 手动排序状态但没有manualOrder数据，回退到添加时间排序`);
      return {
        sortBy: 'addedTime' as const,
        sortDirection: 'desc' as const
      };
    }
    
    console.log(`🔍 获取排序状态 - 视图: ${activeView}, ID: ${currentId}, 状态:`, state);
    return state;
  };

  // 设置当前活动视图的排序状态
  const setCurrentSortState = async (sortBy: 'name' | 'artist' | 'duration' | 'addedTime' | 'manual', sortDirection: 'asc' | 'desc', manualOrder?: string[]) => {
    const currentId = activeView.startsWith('playlist-') ? activeView.replace('playlist-', '') : 'all-music';
    console.log(`💾 设置排序状态 - 视图: ${activeView}, ID: ${currentId}, sortBy: ${sortBy}, 手动顺序长度: ${manualOrder?.length || 0}`);
    
    // 更新内存中的排序状态
    setPlaylistSortStates(prev => ({
      ...prev,
      [currentId]: {
        sortBy,
        sortDirection,
        manualOrder: manualOrder // 直接使用传入的值，如果是undefined就清除
      }
    }));

    // 如果是播放列表，同步更新到数据库
    if (activeView.startsWith('playlist-')) {
      const playlistId = activeView.replace('playlist-', '');
      const playlist = playlists.find(p => p.id === playlistId);
      if (playlist) {
        try {
          // 🔧 关键修复：如果是手动排序，先保存音乐顺序到数据库
          if (sortBy === 'manual' && manualOrder && manualOrder.length > 0) {
            console.log(`💾 保存播放列表 ${playlistId} 的手动排序到数据库...`);
            await window.electronAPI.music.playlists.updateMusicOrder(playlistId, manualOrder);
            console.log('✅ 播放列表手动排序已保存到数据库');
          }
          
          // 更新播放列表的排序状态到数据库
          await window.electronAPI.music.playlists.update(playlistId, {
            sortBy,
            sortDirection,
            manualOrder,
            updatedTime: new Date()
          });
          
          // 🔧 关键修复：更新本地状态时同时更新audioFiles数组
          const updatedPlaylist = {
            ...playlist,
            sortBy,
            sortDirection,
            manualOrder,
            // 🎯 关键：如果是手动排序，audioFiles数组使用手动排序的顺序
            audioFiles: (sortBy === 'manual' && manualOrder) ? manualOrder : playlist.audioFiles,
            updatedTime: new Date()
          };
          setPlaylists(prev => prev.map(p => p.id === playlistId ? updatedPlaylist : p));
          
          console.log(`播放列表排序状态已保存到数据库: ${playlistId}, sortBy: ${sortBy}`);
          if (sortBy === 'manual') {
            console.log('✅ 播放列表的本地状态已更新（包括audioFiles顺序）');
          }
        } catch (error) {
          console.error('保存播放列表排序状态失败:', error);
        }
      }
    } else {
      // 对于"所有音乐"视图，既保存到localStorage也保存到数据库
      try {
        const sortPreferences: any = {
          sortBy,
          sortDirection,
          lastUpdated: new Date().toISOString()
        };
        
        // 只有当manualOrder有值时才保存
        if (manualOrder) {
          sortPreferences.manualOrder = manualOrder;
        }
        
        console.log('🗃️ 保存到localStorage - 所有音乐排序状态:', sortPreferences);
        localStorage.setItem('wedding-music-player-all-music-sort', JSON.stringify(sortPreferences));
        console.log('✅ 成功保存到localStorage');
        
          // 如果是手动排序并且有手动排序数据，也保存到数据库的默认播放列表
        if (sortBy === 'manual' && manualOrder && manualOrder.length > 0) {
          console.log('💾 保存手动排序到数据库的默认播放列表...');
          try {
            // 查找默认播放列表
            const defaultPlaylist = playlists.find(p => p.isDefault);
            if (defaultPlaylist) {
              console.log(`  - 找到默认播放列表: ${defaultPlaylist.id} (${defaultPlaylist.name})`);
              console.log(`  - 保存的排序顺序长度: ${manualOrder.length}`);
              
              // 保存手动排序到数据库
              await window.electronAPI.music.playlists.updateMusicOrder(defaultPlaylist.id, manualOrder);
              console.log('✅ 手动排序已保存到数据库的默认播放列表');
              
              // 同时更新播放列表的排序状态
              await window.electronAPI.music.playlists.update(defaultPlaylist.id, {
                sortBy: 'manual',
                sortDirection: 'desc',
                manualOrder,
                updatedTime: new Date()
              });
              console.log('✅ 默认播放列表的排序状态已更新');
              
              // 🔧 关键修复：同时更新播放列表的audioFiles数组以匹配手动排序顺序
              const updatedPlaylist = {
                ...defaultPlaylist,
                sortBy: 'manual' as const,
                sortDirection: 'desc' as const,
                manualOrder,
                audioFiles: manualOrder, // 🎯 关键：audioFiles数组使用手动排序的顺序
                updatedTime: new Date()
              };
              setPlaylists(prev => prev.map(p => p.id === defaultPlaylist.id ? updatedPlaylist : p));
              console.log('✅ 默认播放列表的本地状态已更新（包括audioFiles顺序）');
              
            } else {
              console.warn('⚠️ 未找到默认播放列表，无法保存手动排序到数据库');
            }
          } catch (dbError) {
            console.error('❌ 保存手动排序到数据库失败:', dbError);
          }
        }
        
      } catch (error) {
        console.warn('无法保存全局排序偏好:', error);
      }
    }
  };


  // 调试用函数 - 暴露到全局以便在控制台调用
  useEffect(() => {
    (window as any).debugSortState = () => {
      console.log('🔧 调试排序状态:');
      console.log('当前视图:', activeView);
      console.log('手动排序模式:', isManualSortMode);
      console.log('原始状态备份:', manualSortOriginalState);
      console.log('所有排序状态:', playlistSortStates);
      console.log('当前排序状态:', getCurrentSortState());
      console.log('localStorage内容:', localStorage.getItem('wedding-music-player-all-music-sort'));
      console.log('音乐文件数量:', musicFiles.length);
      console.log('当前音乐列表数量:', getCurrentMusicList().length);
    };
  });

  // 开始手动排序
  const handleStartManualSort = () => {
    console.log('🎯 开始手动排序模式');
    
    // 保存当前完整的排序状态（包括manualOrder）
    const currentState = getCurrentSortState();
    setManualSortOriginalState({
      sortBy: currentState.sortBy,
      sortDirection: currentState.sortDirection,
      manualOrder: currentState.manualOrder // 保存当前的手动排序数据
    });
    
    console.log('💾 保存进入手动排序前的状态:', {
      sortBy: currentState.sortBy,
      sortDirection: currentState.sortDirection,
      manualOrderLength: currentState.manualOrder?.length || 0
    });
    
    // 获取当前显示的音乐顺序作为手动排序的初始顺序
    const currentMusicList = applySortingToMusicList(getCurrentMusicList());
    const currentOrder = currentMusicList.map(m => m.id);
    console.log('💾 当前音乐顺序作为手动排序初始顺序:', currentOrder);
    
    // 先更新排序状态，再进入手动排序模式
    const currentId = activeView.startsWith('playlist-') ? activeView.replace('playlist-', '') : 'all-music';
    setPlaylistSortStates(prev => ({
      ...prev,
      [currentId]: {
        ...prev[currentId],
        sortBy: 'manual',
        sortDirection: 'desc',
        manualOrder: currentOrder
      }
    }));
    
    // 进入手动排序模式
    setIsManualSortMode(true);
    
    console.log('✅ 已进入手动排序模式，可以拖拽卡片重新排序');
  };

  // 结束手动排序并保存
  const handleFinishManualSort = async () => {
    console.log('💾 结束手动排序并保存结果');
    
    try {
      // 获取当前的音乐顺序
      const currentMusicList = getCurrentMusicList();
      const currentOrder = currentMusicList.map(m => m.id);
      console.log('  - 保存的手动排序顺序:', currentOrder);
      
      // 保存到状态和数据库（sortBy设为manual）
      await setCurrentSortState('manual', 'desc', currentOrder);
      
      // 退出手动排序模式（但保持sortBy为manual，这样下次打开还是手动排序的结果）
      setIsManualSortMode(false);
      setManualSortOriginalState(null);
      
      console.log('✅ 手动排序已保存，退出手动排序模式（保持manual状态）');
      
      // 显示成功通知
      notify.success('排序已保存', '手动排序结果已保存，下次打开将保持此顺序');
      
    } catch (error) {
      console.error('保存手动排序失败:', error);
      notify.error('保存失败', '无法保存手动排序结果，请重试');
    }
  };

  // 取消手动排序
  const handleCancelManualSort = () => {
    console.log('❌ 取消手动排序，恢复原状态');
    
    // 恢复原来的排序状态
    if (manualSortOriginalState) {
      const currentId = activeView.startsWith('playlist-') ? activeView.replace('playlist-', '') : 'all-music';
      
      console.log('🔄 恢复到原始状态:', {
        sortBy: manualSortOriginalState.sortBy,
        sortDirection: manualSortOriginalState.sortDirection,
        manualOrderLength: manualSortOriginalState.manualOrder?.length || 0
      });
      
      setPlaylistSortStates(prev => ({
        ...prev,
        [currentId]: {
          ...prev[currentId],
          sortBy: manualSortOriginalState.sortBy as any,
          sortDirection: manualSortOriginalState.sortDirection as any,
          manualOrder: manualSortOriginalState.manualOrder
        }
      }));
      
      // 如果是"all-music"视图，同时保存到localStorage
      if (currentId === 'all-music') {
        const stateToSave: any = {
          sortBy: manualSortOriginalState.sortBy,
          sortDirection: manualSortOriginalState.sortDirection,
          lastUpdated: new Date().toISOString()
        };
        
        // 如果原来是手动排序，也要保存manualOrder
        if (manualSortOriginalState.sortBy === 'manual' && manualSortOriginalState.manualOrder) {
          stateToSave.manualOrder = manualSortOriginalState.manualOrder;
        }
        
        console.log('🗃️ 取消时保存到localStorage - 恢复状态:', stateToSave);
        localStorage.setItem('wedding-music-player-all-music-sort', JSON.stringify(stateToSave));
        console.log('✅ 取消时成功保存到localStorage');
      }
    }
    
    // 退出手动排序模式
    setIsManualSortMode(false);
    setManualSortOriginalState(null);
    
    console.log('✅ 已恢复原排序状态，退出手动排序模式');
  };

  const handleReorder = async (ids: string[]) => {
    // 拖拽放手后直接保存为手动排序，不要求先进入手动模式
    if (ids.length === 0) {
      console.log('⚠️ 拖拽排序为空，忽略本次操作');
      return;
    }
    
    console.log('🔄 拖拽排序后自动保存:', ids);
    
    // 实时更新手动排序状态
    const currentId = activeView.startsWith('playlist-') ? activeView.replace('playlist-', '') : 'all-music';
    setPlaylistSortStates(prev => ({
      ...prev,
      [currentId]: {
        ...prev[currentId],
        sortBy: 'manual',
        sortDirection: 'desc',
        manualOrder: ids
      }
    }));
    
    // 如果是在"所有音乐"视图中，同时更新全局 musicFiles 的顺序（用于显示）
    if (activeView === 'all-music') {
      setMusicFiles(prev => {
        const idSet = new Set(ids);
        const reordered = ids.map(id => prev.find(m => m.id === id)!).filter(Boolean);
        const remaining = prev.filter(m => !idSet.has(m.id));
        return [...reordered, ...remaining];
      });
    }
    
    try {
      await setCurrentSortState('manual', 'desc', ids);
      setIsManualSortMode(false);
      setManualSortOriginalState(null);
      console.log(`✅ 手动排序已自动保存 - 视图: ${activeView}, 顺序: ${ids.length} 个项目`);
    } catch (error) {
      console.error('自动保存手动排序失败:', error);
      notify.error('保存失败', '排序已调整，但自动保存失败，请重试');
    }
  };

  // 处理拖拽文件到特定播放列表
  const handleImportFilesToPlaylist = async (files: File[], playlistId: string) => {
    try {
      console.log(`开始导入 ${files.length} 个文件到播放列表 ${playlistId}`);
      
      // 过滤出音频文件
      const audioFiles = files.filter(file => {
        const fileType = file.type;
        const fileName = file.name.toLowerCase();
        return fileType.startsWith('audio/') || 
               fileName.endsWith('.mp3') || 
               fileName.endsWith('.wav') || 
               fileName.endsWith('.flac') || 
               fileName.endsWith('.m4a') || 
               fileName.endsWith('.aac') || 
               fileName.endsWith('.ogg') ||
               fileName.endsWith('.wma') ||
               fileName.endsWith('.opus');
      });

      if (audioFiles.length === 0) {
        notify.warning('不支持的文件格式', '请选择音频文件（MP3, WAV, FLAC, M4A, AAC, OGG, WMA, OPUS）');
        return;
      }

      const musicAPI = window.electronAPI?.music;
      if (!musicAPI) {
        throw new Error('音乐API不可用');
      }

      // 转换File对象为AudioFile格式
      const musicFilesToAdd: any[] = [];
      
      for (const file of audioFiles) {
        try {
          // 获取文件路径
          let filePath = (file as any).path;
          
          if (!filePath && (file as any).webkitRelativePath) {
            filePath = (file as any).webkitRelativePath;
          }
          
          if (!filePath) {
            filePath = file.name;
            console.warn(`文件 ${file.name} 没有完整路径，使用文件名作为路径`);
          }

          // 标准化路径
          if (typeof filePath === 'string') {
            filePath = filePath.replace(/\\/g, '/');
          }

          // 尝试读取元数据
          let metadata: any = { 
            title: file.name.replace(/\.[^/.]+$/, ''), 
            artist: 'Unknown Artist', 
            album: 'Unknown Album', 
            duration: 0,
            bitrate: 0,
            sampleRate: 0
          };
          
          try {
            const audioMetadata = await readAudioMetadata(file);
            metadata = {
              title: audioMetadata.title || file.name.replace(/\.[^/.]+$/, ''),
              artist: audioMetadata.artist || 'Unknown Artist',
              album: audioMetadata.album || 'Unknown Album',
              duration: audioMetadata.duration || 0,
              bitrate: audioMetadata.bitrate || 0,
              sampleRate: audioMetadata.sampleRate || 0,
              genre: audioMetadata.genre ? audioMetadata.genre.join(', ') : ''
            };
          } catch (metadataError) {
            console.warn(`读取拖拽文件 ${file.name} 的元数据失败:`, metadataError);
          }

          const musicFile = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            filePath: filePath,
            fileName: file.name,
            // 显示名固定为文件名（不含扩展名），不使用元数据标题
            displayName: file.name.replace(/\.[^/.]+$/, ''),
            artist: metadata.artist,
            album: metadata.album,
            duration: metadata.duration,
            fileSize: file.size,
            format: file.name.split('.').pop() || 'unknown',
            bitrate: metadata.bitrate,
            sampleRate: metadata.sampleRate,
            addedTime: new Date(),
            playCount: 0,
            isFavorite: false,
            customTags: metadata.genre ? [metadata.genre] : [],
            thumbnailPath: null
          };
          
          musicFilesToAdd.push(musicFile);
        } catch (fileError) {
          console.error(`处理文件 ${file.name} 时出错:`, fileError);
        }
      }

      if (musicFilesToAdd.length > 0) {
        // 导入文件到库
        await musicAPI.addBatch(musicFilesToAdd);
        
        // 将文件添加到指定播放列表
        const musicIds = musicFilesToAdd.map(m => m.id);
        await musicAPI.playlists.addMusicBatch(playlistId, musicIds);
        
        // 刷新数据
        await loadPlaylists();
        const updatedMusic = await musicAPI.getAll();
        const convertedUpdatedMusic = updatedMusic.map((audioFile: any) => ({
          id: audioFile.id,
          name: audioFile.displayName || audioFile.fileName || 'Unknown',
          artist: audioFile.artist,
          album: audioFile.album,
          duration: audioFile.duration,
          fileSize: audioFile.fileSize,
          format: audioFile.format,
          isPlaying: false,
          isFavorite: audioFile.isFavorite,
          isTrimmed: audioFile.isTrimmed || false,
          addedTime: new Date(audioFile.addedTime),
          url: audioFile.filePath ? filePathToFileURL(audioFile.filePath) : '',
          file: null as any,
          filePath: audioFile.filePath,
          fileName: audioFile.fileName,
          displayName: audioFile.displayName,
          bitrate: audioFile.bitrate,
          sampleRate: audioFile.sampleRate,
          lastPlayTime: audioFile.lastPlayTime ? new Date(audioFile.lastPlayTime) : undefined,
          playCount: audioFile.playCount,
          customTags: audioFile.customTags,
          thumbnailPath: audioFile.thumbnailPath
        }));
        setMusicFiles(convertedUpdatedMusic);
        
        const playlist = playlists.find(p => p.id === playlistId);
        notify.success('导入成功', `已将 ${musicFilesToAdd.length} 首歌曲添加到播放列表 "${playlist?.name}"`);
      }
    } catch (error) {
      console.error('导入文件到播放列表失败:', error);
      notify.error('导入失败', '无法将文件添加到播放列表，请重试');
    }
  };
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [showDebugConsole, setShowDebugConsole] = useState(false);
  
  // 全局录音状态管理
  const [isGlobalRecording, setIsGlobalRecording] = useState(false);
  const [globalRecordingTime, setGlobalRecordingTime] = useState(0);
  const [globalRecordingPath, setGlobalRecordingPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  
  // 音乐播放状态
  const [currentMusic, setCurrentMusic] = useState<MusicFile | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [playMode, setPlayMode] = useState<'sequential' | 'loop' | 'single' | 'shuffle'>('single');
  
  // 当前播放歌单状态
  const [currentPlayingPlaylistId, setCurrentPlayingPlaylistId] = useState<string | null>(null);
  
  // 获取当前播放歌单信息
  const getCurrentPlayingPlaylist = () => {
    if (!currentPlayingPlaylistId) return null;
    return playlists.find(p => p.id === currentPlayingPlaylistId) || null;
  };

  // 播放模式循环切换函数
  const handleTogglePlayMode = () => {
    const modes: Array<'sequential' | 'loop' | 'single' | 'shuffle'> = ['sequential', 'loop', 'single', 'shuffle'];
    const nextIndex = (modes.indexOf(playMode) + 1) % modes.length;
    setPlayMode(modes[nextIndex]);
  };

  // 进度条状态
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const progressBarRef = useRef<HTMLDivElement>(null);
  
  // 数据状态
  const [musicFiles, setMusicFiles] = useState<MusicFile[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // 从localStorage和播放列表数据中恢复排序状态
  useEffect(() => {
    const loadSortStates = () => {
      const newSortStates: typeof playlistSortStates = {};

      // 加载"所有音乐"的排序状态
      try {
        const saved = localStorage.getItem('wedding-music-player-all-music-sort');
        console.log('🔄 加载"所有音乐"排序状态:', saved);
        if (saved) {
          const parsed = JSON.parse(saved);
          console.log('📋 解析后的排序状态:', parsed);
          newSortStates['all-music'] = {
            sortBy: parsed.sortBy || 'addedTime',
            sortDirection: parsed.sortDirection || 'desc',
            manualOrder: parsed.manualOrder
          };
          console.log('✅ "所有音乐"排序状态已设置:', newSortStates['all-music']);
        } else {
          console.log('⚠️ 没有找到保存的"所有音乐"排序状态');
        }
      } catch (error) {
        console.warn('无法读取全局排序偏好:', error);
      }

      // 加载各个播放列表的排序状态
      playlists.forEach(playlist => {
        if (playlist.sortBy) {
          newSortStates[playlist.id] = {
            sortBy: playlist.sortBy,
            sortDirection: playlist.sortDirection || 'desc',
            manualOrder: playlist.manualOrder
          };
        }
      });

      setPlaylistSortStates(newSortStates);
      console.log('🎯 所有排序状态已加载:', newSortStates);
    };

    loadSortStates();
  }, [playlists]);

  // 音频播放器引用
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // 通知系统
  const { notifications, removeNotification, notify } = useNotifications();

  // 全局录音状态监听
  useEffect(() => {
    let unsubscribeStarted: (() => void) | null = null;
    let unsubscribeStopped: (() => void) | null = null;
    let recordingTimer: NodeJS.Timeout | null = null;

    if (window.electronAPI?.consoleRecording) {
      // 监听录音开始事件
      if (window.electronAPI.consoleRecording.onRecordingStarted) {
        unsubscribeStarted = window.electronAPI.consoleRecording.onRecordingStarted((path: string) => {
          console.log('全局监听：录音已开始，文件路径:', path);
          setIsGlobalRecording(true);
          setGlobalRecordingPath(path);
          setGlobalRecordingTime(0);
          
          // 开始计时器
          recordingTimer = setInterval(() => {
            setGlobalRecordingTime(prev => prev + 1);
          }, 1000);
        });
      }

      // 监听录音停止事件
      if (window.electronAPI.consoleRecording.onRecordingStopped) {
        unsubscribeStopped = window.electronAPI.consoleRecording.onRecordingStopped(() => {
          console.log('全局监听：录音已停止');
          setIsGlobalRecording(false);
          
          // 清除计时器
          if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
          }
        });
      }
    }

    return () => {
      // 清理事件监听和计时器
      if (unsubscribeStarted) unsubscribeStarted();
      if (unsubscribeStopped) unsubscribeStopped();
      if (recordingTimer) clearInterval(recordingTimer);
    };
  }, []);

  // 格式化录音时间
  const formatRecordingTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  };

  // 手动停止录音
  const handleGlobalStopRecording = async () => {
    try {
      if (window.electronAPI?.consoleRecording?.stop) {
        const result = await window.electronAPI.consoleRecording.stop();
        if (!result.success) {
          notify.error('停止录音失败', result.error || '未知错误');
        }
        // 移除成功提示，减少打扰
      }
    } catch (error) {
      console.error('停止录音失败:', error);
      notify.error('停止录音失败', '无法停止录音');
    }
  };

  const lastPlayActionTimeRef = useRef<number>(0);
  const overlapAudioRef = useRef<HTMLAudioElement | null>(null);
  const crossfadeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('wedding-music-player-overlap-enabled', JSON.stringify(isOverlapEnabled));
    } catch (error) {
      console.warn('无法保存歌曲重叠设置:', error);
    }
  }, [isOverlapEnabled]);

  // Activation states
  const [isActivated, setIsActivated] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [macInput, setMacInput] = useState('');
  const [step, setStep] = useState(1); // New: for wizard steps
  // Remove: const [isCopied, setIsCopied] = useState(false);
  const IS_PRODUCTION = false; // Toggle to true for 30 days
  const SECRET_SALT = 'your-secret-salt-here'; // Replace with actual secret salt, keep secure
  const [isActivating, setIsActivating] = useState(false); // New: for activation process
  const [activationExpiry, setActivationExpiry] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  interface ActivationData {
    expirationTime: number;
    checksum: string;
  }

  // New: MAC validation function
  const isValidMAC = (mac: string) => /^([0-9A-Fa-f]{2}:){5}([0-9A-Fa-f]{2})$/.test(mac);

  const checkActivation = async () => {
    try {
      const saved = await window.electronAPI.storage.get('activation');
      if (!saved) {
        console.log('未找到激活信息');
        // 检查是否为离线状态，离线时允许无激活使用
        if (!isOnline) {
          console.log('离线状态下允许无激活使用');
          setIsActivated(true);
          setActivationExpiry(null);
          return;
        }
        setIsActivated(false);
        setActivationExpiry(null);
        return;
      }

      const now = Date.now();
      // 首先检查时间有效性
      const isTimeValid = Boolean(saved.expirationTime && now < saved.expirationTime);
      
      if (!isTimeValid) {
        console.log('激活已过期');
        // 如果是离线状态，不删除激活信息，允许用户继续使用
        if (!isOnline) {
          console.log('离线状态下忽略过期检查，允许继续使用');
          setIsActivated(true);
          setActivationExpiry(saved.expirationTime ? new Date(saved.expirationTime).toISOString() : null);
          return;
        }
        setIsActivated(false);
        setActivationExpiry(null);
        await window.electronAPI.storage.delete('activation');
        notify.warning('激活已过期', '请重新激活应用');
        return;
      }

      // 时间有效的情况下，尝试验证MAC地址（仅用于日志与提示，不影响激活状态）
      let isMacValid = true;
      try {
        console.log('验证MAC地址...');
        const currentMac = await window.electronAPI.getMACAddress();
        
        if (currentMac && saved.mac) {
          isMacValid = currentMac.toLowerCase() === String(saved.mac).toLowerCase();
          if (!isMacValid) {
            console.log('MAC地址不匹配');
          }
        } else if (saved.mac) {
          // 如果保存了MAC但获取不到当前MAC，在网络正常情况下认为设备改变
          console.log('无法获取当前MAC地址，但激活信息中存在MAC绑定');
          // 这里不立即标记为无效，给用户一个宽限期
          isMacValid = true; // 暂时允许通过，避免断网误判
        }
      } catch (macError) {
        console.log('获取MAC地址失败，可能是网络问题，暂时忽略MAC验证:', macError);
        // 检查是否是网络问题
        if (!isOnline) {
          console.log('检测到离线状态，跳过MAC验证');
          isMacValid = true; // 离线时不验证MAC
        } else {
          console.log('在线状态下MAC验证失败，可能是其他问题');
          // 在线状态下MAC获取失败，给一定宽限时间
          isMacValid = true; // 暂时允许通过，避免过度严格
        }
      }

      // 断网/联网切换时，若未过期，始终保持激活；MAC不匹配仅记录日志
      const isValid = isTimeValid;

      setIsActivated(isValid);
      setActivationExpiry(isValid ? new Date(saved.expirationTime).toISOString() : null);

      if (!isMacValid && isValid) {
        console.warn('MAC地址与激活信息不一致，已忽略（保持激活直到到期）');
      }

      if (isValid) {
        console.log('激活验证通过（基于有效期）');
      }
      
    } catch (error) {
      console.error('激活检查过程中出现错误:', error);
      // 发生未知错误时，不强制要求重新激活，保持当前状态
      // 这样可以避免网络问题导致的误判
      try {
        const saved = await window.electronAPI.storage.get('activation');
        if (saved && saved.expirationTime && Date.now() < saved.expirationTime) {
          // 如果本地有有效的激活信息，就使用它
          setIsActivated(true);
          setActivationExpiry(new Date(saved.expirationTime).toISOString());
          console.log('使用本地缓存的激活状态');
        } else {
          setIsActivated(false);
          setActivationExpiry(null);
        }
      } catch (fallbackError) {
        console.error('备用激活检查也失败:', fallbackError);
        setIsActivated(false);
        setActivationExpiry(null);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      await checkActivation();
      
      // 移除全局快捷键弹窗提示 - 用户不希望看到这个通知
      // setTimeout(() => {
      //   notify.info(
      //     '全局快捷键已启用', 
      //     '即使窗口失焦也可使用：空格键播放/暂停，←→键切换歌曲，↑↓键调节音量，Esc紧急静音'
      //   );
      // }, 2000);
    };
    init();
  }, [notify]);

  // 智能定期检查激活状态（每24小时在深夜检查一次）
  useEffect(() => {
    const getOptimalCheckTime = () => {
      const now = new Date();
      const nextCheck = new Date();
      
      // 智能选择检查时间：凌晨2-4点之间（用户通常不在使用）
      // 随机选择一个时间点，避免所有用户在同一时间检查
      const checkHour = 2 + Math.floor(Math.random() * 3); // 2, 3, 或 4 点
      const checkMinute = Math.floor(Math.random() * 60); // 随机分钟
      
      nextCheck.setHours(checkHour, checkMinute, 0, 0);
      
      // 如果当前时间已经过了今天的检查时间，则设置为明天
      if (now.getTime() >= nextCheck.getTime()) {
        nextCheck.setDate(nextCheck.getDate() + 1);
      }
      
      return nextCheck;
    };

    const scheduleNextCheck = async () => {
      // 检查是否最近已经检查过了
      try {
        const lastCheck = await window.electronAPI.storage.get('lastSuccessfulActivationCheck');
        if (lastCheck) {
          const timeSinceLastCheck = Date.now() - lastCheck;
          const hoursTimeout = 20 * 60 * 60 * 1000; // 20小时
          
          if (timeSinceLastCheck < hoursTimeout) {
            const nextCheckTime = new Date(lastCheck + hoursTimeout);
            console.log(`⏳ 距离上次检查不足20小时，推迟到: ${nextCheckTime.toLocaleString()}`);
            // 重新安排到合适的时间
            setTimeout(() => scheduleNextCheck(), hoursTimeout - timeSinceLastCheck);
            return;
          }
        }
      } catch (error) {
        console.log('获取最后检查时间失败，继续正常安排:', error);
      }

      const nextCheck = getOptimalCheckTime();
      const timeUntilCheck = nextCheck.getTime() - Date.now();
      
      console.log(`📅 下次激活检查安排在: ${nextCheck.toLocaleString()} (${Math.round(timeUntilCheck / (1000 * 60 * 60))} 小时后)`);
      
      const timeoutId = setTimeout(async () => {
        // 再次确认激活状态，避免无谓的检查
        if (!isActivated) {
          console.log('⏭️ 跳过检查：当前未激活状态');
          scheduleNextCheck(); // 继续安排下次检查
          return;
        }

        // 检查是否在深夜时间（避免在用户活跃时间检查）
        const currentHour = new Date().getHours();
        if (currentHour >= 6 && currentHour <= 23) {
          console.log('⏰ 跳过检查：当前不在深夜时间段，避免打扰用户');
          // 推迟到下一个深夜时间
          scheduleNextCheck();
          return;
        }

        try {
          console.log('🌙 深夜定期检查激活状态...');
          const startTime = Date.now();
          
          // 记录检查时间，避免重复检查
          await window.electronAPI.storage.set('lastActivationCheck', startTime);
          
          await checkActivation();
          const duration = Date.now() - startTime;
          console.log(`✅ 激活检查完成，耗时: ${duration}ms`);
          
          // 更新最后成功检查时间
          await window.electronAPI.storage.set('lastSuccessfulActivationCheck', Date.now());
        } catch (error) {
          console.log('❌ 深夜定期激活检查失败，将在下次检查中重试:', error);
          // 检查失败时不显示错误提示，避免打扰用户
        }
        
        // 检查完成后，安排下一次检查（24小时后）
        await scheduleNextCheck();
      }, timeUntilCheck);
      
      return timeoutId;
    };

    // 管理定时器的状态
    let currentTimeoutId: NodeJS.Timeout | null = null;
    let isCleanedUp = false;
    
    const safeScheduleNext = async () => {
      if (isCleanedUp) return;
      
      try {
        const timeoutId = await scheduleNextCheck();
        currentTimeoutId = timeoutId || null;
      } catch (error) {
        console.error('安排定期检查失败:', error);
        // 失败时延迟1小时后重试
        if (!isCleanedUp) {
          currentTimeoutId = setTimeout(() => {
            if (!isCleanedUp) {
              safeScheduleNext();
            }
          }, 60 * 60 * 1000);
        }
      }
    };
    
    // 只有在激活状态下才启动定期检查
    if (isActivated) {
      console.log('🌟 启动智能激活检查系统 - 每24小时在深夜(2-4点)自动检查');
      safeScheduleNext();
    } else {
      console.log('🚫 未激活状态，跳过定期检查安排');
    }

    return () => {
      isCleanedUp = true;
      if (currentTimeoutId) {
        clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
        console.log('🧹 清理激活检查定时器');
      }
    };
  }, [isActivated]);

  // 监听网络状态变化
  useEffect(() => {
    const handleOnline = () => {
      console.log('网络已连接');
      setIsOnline(true);
      // 网络恢复时重新检查激活状态（如果当前未激活）
      if (!isActivated) {
        setTimeout(() => {
          checkActivation();
        }, 1000);
      }
    };

    const handleOffline = () => {
      console.log('网络已断开');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isActivated]);

  // 加载歌单函数
  const loadPlaylists = async () => {
    try {
      const playlistData = await window.electronAPI.music.playlists.getAll();
      
      // 初始化缺失的 displayOrder 字段
      const playlistsWithOrder = playlistData.map((playlist, index) => {
        if (typeof playlist.displayOrder !== 'number') {
          return {
            ...playlist,
            displayOrder: index
          };
        }
        return playlist;
      });
      
      // 按照 displayOrder 排序歌单
      const sortedPlaylists = playlistsWithOrder.sort((a, b) => {
        const orderA = a.displayOrder ?? 999;
        const orderB = b.displayOrder ?? 999;
        return orderA - orderB;
      });
      
      setPlaylists(sortedPlaylists);
      console.log(`重新加载了 ${sortedPlaylists.length} 个歌单`);
    } catch (error) {
      console.error('加载歌单失败:', error);
    }
  };

  // 歌单重排序处理
  const handlePlaylistReorder = async (fromIndex: number, toIndex: number) => {
    try {
      console.log(`歌单重排序: 从 ${fromIndex} 移动到 ${toIndex}`);
      
      // 创建新的歌单数组
      const newPlaylists = [...playlists];
      const [movedPlaylist] = newPlaylists.splice(fromIndex, 1);
      newPlaylists.splice(toIndex, 0, movedPlaylist);
      
      // 更新 displayOrder 字段
      const updatedPlaylists = newPlaylists.map((playlist, index) => ({
        ...playlist,
        displayOrder: index,
        updatedTime: new Date()
      }));
      
      // 更新本地状态
      setPlaylists(updatedPlaylists);
      
      // 使用新的批量更新API保存歌单顺序
      const playlistIds = updatedPlaylists.map(p => p.id);
      await window.electronAPI.music.playlists.updateOrder(playlistIds);
      
      console.log('✅ 歌单排序已保存');
      // 移除成功提示，减少打扰
      
    } catch (error) {
      console.error('歌单重排序失败:', error);
      notify.error('排序失败', '无法保存歌单顺序，请重试');
      
      // 重新加载歌单以恢复原状态
      await loadPlaylists();
    }
  };

  // Handle activation
  const handleActivate = async () => {
    try {
      console.log('Starting activation with MAC:', macInput);
      setIsActivating(true);
      
      // 检查网络状态
      if (!isOnline) {
        toast.warning('检测到网络未连接，激活可能会失败。请检查网络连接后重试。');
        // 仍然允许尝试激活，因为网络检测不一定准确
      }
      
      if (!activationCode || !macInput) {
        toast.error('请填写激活码和MAC地址');
        return;
      }
      if (!isValidMAC(macInput)) {
        toast.error('MAC地址格式不正确，应为XX:XX:XX:XX:XX:XX');
        return;
      }
      
      const result = await window.electronAPI.validateActivationKey(activationCode.trim(), macInput.trim().toLowerCase());
      if (result.valid) {
        setIsActivated(true);
        setActivationExpiry(result.expiry || null);
        // 移除激活成功提示，减少打扰
        console.log('激活成功！有效期至: ' + (result.expiry || '未知'));
      } else {
        toast.error('激活失败: ' + (result.error || '无效激活码'));
      }
    } catch (error) {
      console.error('Activation failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('网络') || errorMessage.includes('connection') || errorMessage.includes('timeout')) {
        toast.error('激活失败: 网络连接问题，请检查网络后重试');
      } else {
        toast.error('激活失败: ' + errorMessage);
      }
    } finally {
      setIsActivating(false);
    } 
  };

  // New: copy machineId
  // Remove: const copyMachineId = () => {
  // Remove:   navigator.clipboard.writeText(machineIdDisplay);
  // Remove:   setIsCopied(true);
  // Remove:   setTimeout(() => setIsCopied(false), 2000);
  // Remove: };

  // 重新加载音乐数据的函数
  const reloadMusicData = async (forceRefreshId?: string) => {
    try {
      console.log('重新加载音乐数据...', forceRefreshId ? `强制刷新ID: ${forceRefreshId}` : '');
      const musicData = await window.electronAPI.music.getAll();
      
      // 转换数据格式
      const convertedMusicData = musicData.map((audioFile: any) => ({
        id: audioFile.id,
        name: audioFile.displayName || audioFile.fileName || 'Unknown',
        artist: audioFile.artist,
        album: audioFile.album,
        duration: audioFile.duration,
        fileSize: audioFile.fileSize,
        format: audioFile.format,
        isPlaying: false,
        isFavorite: audioFile.isFavorite,
        isTrimmed: audioFile.isTrimmed || false,
        addedTime: new Date(audioFile.addedTime),
        url: audioFile.filePath ? filePathToFileURL(audioFile.filePath) : '',
        file: null as any,
        filePath: audioFile.filePath,
        fileName: audioFile.fileName,
        displayName: audioFile.displayName,
        bitrate: audioFile.bitrate,
        sampleRate: audioFile.sampleRate,
        lastPlayTime: audioFile.lastPlayTime ? new Date(audioFile.lastPlayTime) : undefined,
        playCount: audioFile.playCount,
        customTags: audioFile.customTags,
        thumbnailPath: audioFile.thumbnailPath,
        updatedTime: audioFile.updatedTime ? new Date(audioFile.updatedTime) : undefined
      }));

      // 去重处理
      const uniqueMusicData = convertedMusicData.filter((music, index, self) => 
        index === self.findIndex(m => m.id === music.id)
      );

      // 保持当前播放状态，但对于强制刷新的音乐确保使用数据库状态
      const updatedMusicData = uniqueMusicData.map(music => {
        const existingMusic = musicFiles.find(m => m.id === music.id);
        if (existingMusic) {
          // 如果是强制刷新的音乐，优先使用数据库状态，只保持播放状态
          if (forceRefreshId === music.id) {
            console.log(`强制刷新音乐 ${music.id} 状态:`, {
              duration: music.duration,
              isTrimmed: music.isTrimmed,
              保持播放状态: existingMusic.isPlaying
            });
            return {
              ...music,
              isPlaying: existingMusic.isPlaying // 只保持播放状态
            };
          } else {
            return {
              ...music,
              isPlaying: existingMusic.isPlaying // 保持播放状态
            };
          }
        }
        return music;
      });

      setMusicFiles(updatedMusicData);

      const playlistData = await window.electronAPI.music.playlists.getAll();
      const sortedPlaylists = playlistData
        .map((playlist, index) => ({
          ...playlist,
          displayOrder: typeof playlist.displayOrder === 'number' ? playlist.displayOrder : index
        }))
        .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
      setPlaylists(sortedPlaylists);
      setPlaylistSortStates(prev => {
        const next = { ...prev };
        sortedPlaylists.forEach(playlist => {
          next[playlist.id] = {
            sortBy: playlist.sortBy || next[playlist.id]?.sortBy || 'addedTime',
            sortDirection: playlist.sortDirection || next[playlist.id]?.sortDirection || 'desc',
            manualOrder: playlist.manualOrder || next[playlist.id]?.manualOrder || []
          };
        });
        return next;
      });
      
      // 更新当前音乐信息（如果正在播放剪辑的音乐）
      if (currentMusic) {
        const updatedCurrentMusic = updatedMusicData.find(m => m.id === currentMusic.id);
        if (updatedCurrentMusic) {
          setCurrentMusic(updatedCurrentMusic);
        }
      }
      
      console.log(`重新加载了 ${updatedMusicData.length} 首音乐`);
    } catch (error) {
      console.error('重新加载音乐数据失败:', error);
    }
  };

  // 加载数据
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('开始加载数据...');
        
        // 确保默认歌单存在
        await window.electronAPI.music.playlists.ensureDefault();
        
        // 加载音乐文件
        const musicData = await window.electronAPI.music.getAll();
        console.log('从数据库加载的音乐数据:', musicData);
        
        // 转换数据格式
        const convertedMusicData = musicData.map((audioFile: any) => ({
          id: audioFile.id,
          name: audioFile.displayName || audioFile.fileName || 'Unknown',
          artist: audioFile.artist,
          album: audioFile.album,
          duration: audioFile.duration,
          fileSize: audioFile.fileSize,
          format: audioFile.format,
          isPlaying: false,
          isFavorite: audioFile.isFavorite,
          isTrimmed: audioFile.isTrimmed || false,
          addedTime: new Date(audioFile.addedTime),
          url: audioFile.filePath ? filePathToFileURL(audioFile.filePath) : '',
          file: null as any, // 数据库中没有File对象
          // 数据库字段
          filePath: audioFile.filePath,
          fileName: audioFile.fileName,
          displayName: audioFile.displayName,
          bitrate: audioFile.bitrate,
          sampleRate: audioFile.sampleRate,
          lastPlayTime: audioFile.lastPlayTime ? new Date(audioFile.lastPlayTime) : undefined,
          playCount: audioFile.playCount,
          customTags: audioFile.customTags,
          thumbnailPath: audioFile.thumbnailPath,
          updatedTime: audioFile.updatedTime ? new Date(audioFile.updatedTime) : undefined
        }));
        
        // 注意：不再从localStorage恢复排序，统一使用数据库的排序顺序
        // 音乐的排序由数据库的order_index字段维护，确保一致性
        console.log('使用数据库排序顺序，不再依赖localStorage')
        
        // 去重：确保没有重复的音乐文件
        const uniqueMusicData = convertedMusicData.filter((music, index, array) => 
          array.findIndex(m => m.id === music.id) === index
        );
        
        setMusicFiles(uniqueMusicData);
        console.log(`加载了 ${uniqueMusicData.length} 首音乐 (原始: ${convertedMusicData.length})`);
        
        // 加载播放列表
        const playlistData = await window.electronAPI.music.playlists.getAll();
        console.log('从数据库加载的歌单数据:', playlistData);
        
        // 初始化缺失的 displayOrder 字段
        const playlistsWithOrder = playlistData.map((playlist, index) => {
          if (typeof playlist.displayOrder !== 'number') {
            return {
              ...playlist,
              displayOrder: index
            };
          }
          return playlist;
        });
        
        // 按照 displayOrder 排序歌单
        const sortedPlaylists = playlistsWithOrder.sort((a, b) => {
          const orderA = a.displayOrder ?? 999;
          const orderB = b.displayOrder ?? 999;
          return orderA - orderB;
        });
        
        // 保存初始化的 displayOrder（如果有变化）
        for (const playlist of sortedPlaylists) {
          if (typeof playlistData.find(p => p.id === playlist.id)?.displayOrder !== 'number') {
            try {
              await window.electronAPI.music.playlists.update(playlist.id, {
                displayOrder: playlist.displayOrder
              });
            } catch (error) {
              console.warn(`更新歌单 ${playlist.name} 的排序失败:`, error);
            }
          }
        }
        
        // 播放列表已在上面设置
        console.log(`加载了 ${sortedPlaylists.length} 个歌单 (已按 displayOrder 排序)`);
        
        // 从数据库恢复每个播放列表的排序状态 
        // 🎯 数据库层面已修复：getAllPlaylists()现在直接返回正确的audioFiles顺序
        const initialSortStates: Record<string, any> = {};
        sortedPlaylists.forEach(playlist => {
          // 🔧 修复：只有在数据库中没有保存排序状态时才使用默认值
          const sortBy = playlist.sortBy || 'addedTime';
          const sortDirection = playlist.sortDirection || 'desc';
          const manualOrder = playlist.manualOrder || [];
          
          console.log(`🔄 恢复播放列表 ${playlist.name} 的排序状态: sortBy=${sortBy}, manualOrder长度=${manualOrder.length}`);
          
          initialSortStates[playlist.id] = {
            sortBy,
            sortDirection,
            manualOrder
          };
        });
        
        // 直接使用从数据库加载的播放列表（已经包含正确的audioFiles顺序）
        setPlaylists(sortedPlaylists);
        // 设置全部音乐的排序状态 - 从默认播放列表读取手动排序数据
        const defaultPlaylist = sortedPlaylists.find(p => p.isDefault);
        if (defaultPlaylist && defaultPlaylist.sortBy === 'manual' && defaultPlaylist.manualOrder) {
          console.log('🔄 从默认播放列表恢复all-music的手动排序:', defaultPlaylist.manualOrder.length, '项');
          initialSortStates['all-music'] = {
            sortBy: 'manual',
            sortDirection: 'desc',
            manualOrder: defaultPlaylist.manualOrder
          };
          
          // 同时更新localStorage以保持一致性
          try {
            const sortPreferences = {
              sortBy: 'manual',
              sortDirection: 'desc',
              manualOrder: defaultPlaylist.manualOrder,
              lastUpdated: new Date().toISOString()
            };
            localStorage.setItem('wedding-music-player-all-music-sort', JSON.stringify(sortPreferences));
            console.log('🗃️ 已同步手动排序到localStorage');
          } catch (error) {
            console.warn('同步到localStorage失败:', error);
          }
        } else {
          // 如果没有默认播放列表的手动排序，使用默认排序
          initialSortStates['all-music'] = {
            sortBy: 'addedTime',
            sortDirection: 'desc',
            manualOrder: []
          };
        }
        setPlaylistSortStates(initialSortStates);
        console.log('已恢复播放列表排序状态:', initialSortStates);
        
        // 设置默认视图为默认歌单
        // 注意：已经在上面定义了defaultPlaylist，这里直接使用
        if (defaultPlaylist && !activeView) {
          console.log('设置默认视图为默认歌单:', defaultPlaylist.name);
          setActiveView(`playlist-${defaultPlaylist.id}`);
        } else if (!activeView) {
          // 如果没有默认歌单，则显示全部音乐
          console.log('没有找到默认歌单，显示全部音乐');
          setActiveView('all-music');
        }
        
        setIsDataLoaded(true);
        console.log('数据加载完成');
      } catch (error) {
        console.error('=== 数据加载失败详细信息 ===');
        console.error('错误对象:', error);
        console.error('错误消息:', error instanceof Error ? error.message : String(error));
        console.error('错误堆栈:', error instanceof Error ? error.stack : 'N/A');
        console.error('平台信息:', navigator.platform);
        console.error('用户代理:', navigator.userAgent);
        console.error('电子API可用性:', {
          electronAPI: !!window.electronAPI,
          music: !!window.electronAPI?.music,
          getAll: !!window.electronAPI?.music?.getAll,
          playlists: !!window.electronAPI?.music?.playlists,
          playlistsGetAll: !!window.electronAPI?.music?.playlists?.getAll
        });
        
        let errorMessage = '无法加载音乐数据';
        
        if (error instanceof Error) {
          if (error.message.includes('database') || error.message.includes('数据库')) {
            errorMessage = '数据库初始化失败，可能是权限问题';
          } else if (error.message.includes('API') || error.message.includes('不可用')) {
            errorMessage = '音乐API不可用，请重启应用';
          } else if (error.message.includes('timeout') || error.message.includes('超时')) {
            errorMessage = '数据加载超时，请重试';
          } else if (error.message.includes('permission') || error.message.includes('权限')) {
            errorMessage = '文件权限不足，请以管理员身份运行';
          }
        }
        
        notify.error('数据加载失败', errorMessage);
      }
    };

    loadData();
  }, []);

  // 初始化音频元素
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 监听URL hash变化以支持音频编辑器路由
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      console.log('=== Hash变化监听 ===');
      console.log('当前hash:', hash);
      console.log('当前activeView:', activeView);
      
      // 处理音频编辑器路由
      if (hash.startsWith('#/audio-editor/')) {
        const { musicId, playlistId } = parseAudioEditorHash(hash);
        console.log('检测到音频编辑器路由，音乐ID:', musicId, '歌单ID:', playlistId);
        setActiveModule('audio-editor');
        setAudioEditorMusicId(musicId);
        setAudioEditorPlaylistId(playlistId);
        console.log('已设置activeModule为audio-editor，musicId:', musicId);
        return; // 早期返回，避免后续处理
      } else if (hash === '#/audio-editor') {
        console.log('检测到音频编辑器路由（无ID）');
        setActiveModule('audio-editor');
        setAudioEditorMusicId(null);
        setAudioEditorPlaylistId(null);
        return; // 早期返回，避免后续处理
      }
      
      // 处理返回主页的情况
      if (hash === '#/' || hash === '') {
        console.log('检测到主页路由，返回音乐播放模块');
        setActiveModule('music-playback');
        setAudioEditorMusicId(null);
        setAudioEditorPlaylistId(null);
        
        // 如果没有activeView，设置默认视图
        if (!activeView && playlists.length > 0) {
          console.log('应用初始化，设置默认视图');
          const defaultPlaylist = playlists.find(p => p.isDefault);
          if (defaultPlaylist) {
            console.log('设置为默认歌单:', defaultPlaylist.id);
            setActiveView(`playlist-${defaultPlaylist.id}`);
          } else {
            console.log('没有默认歌单，设置为全部音乐');
            setActiveView('all-music');
          }
        }
      } else if (hash !== '#/' && hash !== '' && !hash.startsWith('#/audio-editor')) {
        console.log('未匹配的hash路由:', hash);
      }
    };

    // 只监听hash变化事件，不在useEffect中立即执行
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []); // 移除依赖项，避免重复执行
  
  // 单独处理应用初始化
  useEffect(() => {
    if (playlists.length > 0 && !activeView) {
      console.log('=== 应用初始化 ===');
      const hash = window.location.hash;
      console.log('初始hash:', hash);
      
      if (hash.startsWith('#/audio-editor/')) {
        const { musicId, playlistId } = parseAudioEditorHash(hash);
        setActiveModule('audio-editor');
        setAudioEditorMusicId(musicId);
        setAudioEditorPlaylistId(playlistId);
      } else if (hash === '#/audio-editor') {
        setActiveModule('audio-editor');
        setAudioEditorMusicId(null);
        setAudioEditorPlaylistId(null);
      } else {
        // 设置默认模块和视图
        setActiveModule('music-playback');
        const defaultPlaylist = playlists.find(p => p.isDefault);
        if (defaultPlaylist) {
          setActiveView(`playlist-${defaultPlaylist.id}`);
        } else {
          setActiveView('all-music');
        }
      }
    }
  }, [playlists, activeView]);

  // 监听音乐列表刷新事件
  useEffect(() => {
    let refreshTimeout: NodeJS.Timeout;
    
    const handleMusicListRefresh = (event: CustomEvent) => {
      console.log('收到音乐列表刷新事件:', event.detail);
      
      // 防抖：延迟执行，避免频繁刷新
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        const updatedMusicId = event.detail?.updatedMusicId;
        reloadMusicData(updatedMusicId);
      }, 300); // 300ms延迟
    };

    window.addEventListener('music-list-refresh', handleMusicListRefresh as EventListener);
    
    return () => {
      clearTimeout(refreshTimeout);
      window.removeEventListener('music-list-refresh', handleMusicListRefresh as EventListener);
    };
  }, []);

  // 监听音频事件
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (!isDragging && audio.duration > 0) {
        // 对于剪辑音乐，检查是否超过了剪辑时长
        if (currentMusic?.isTrimmed && currentMusic.duration) {
          if (audio.currentTime >= currentMusic.duration) {
            console.log(`剪辑音乐播放完成: ${audio.currentTime.toFixed(2)}s >= ${currentMusic.duration}s`);
            // 触发歌曲结束事件
            audio.currentTime = currentMusic.duration;
            setCurrentTime(currentMusic.duration);
            handleEnded();
            return;
          }
        }
        
        setCurrentTime(audio.currentTime);
        // 每5秒输出一次调试信息，帮助诊断进度条问题
        if (Math.floor(audio.currentTime) % 5 === 0 && audio.currentTime > 0) {
          console.log(`⏱️ 播放进度: ${audio.currentTime.toFixed(1)}s / ${audio.duration.toFixed(1)}s`);
        }
      }
    };

    const handleEnded = () => {
      // 单曲循环：歌曲结束时重新播放当前曲目（不走“下一首”逻辑）
      if (playMode === 'single' && currentMusic && audioRef.current) {
        const player = audioRef.current;
        try {
          player.currentTime = 0;
          player.play().catch(console.error);
          setIsPlaying(true);
        } catch {}
        return;
      }
      handleNext();
    };

    const handleLoadedMetadata = async () => {
      if (currentMusic && audio.duration) {
        const actualDuration = Math.floor(audio.duration);
        console.log(`🎵 音频加载完成: ${currentMusic.name}, 实际时长: ${actualDuration}秒, 数据库时长: ${currentMusic.duration}秒, 是否剪辑: ${currentMusic.isTrimmed}`);
        
        // 如果是剪辑过的音乐，保持数据库中的时长，不用实际音频时长覆盖
        if (currentMusic.isTrimmed) {
          console.log(`🎵 ${currentMusic.name} 是剪辑音乐，保持数据库时长: ${currentMusic.duration}秒`);
          return; // 不更新时长
        }
        
        // 一致性修复：如果未标记剪辑，但实际时长明显短于数据库时长，说明文件已被剪辑替换
        if (!currentMusic.isTrimmed && currentMusic.duration && currentMusic.duration - actualDuration > 3) {
          console.log(`🔧 检测到文件已剪辑但未标记，修正为剪辑状态，时长=${actualDuration}s`);

          // 先更新本地状态，立即修正进度条与展示
          setMusicFiles(prev => prev.map(m =>
            m.id === currentMusic.id
              ? { ...m, duration: actualDuration, isTrimmed: true }
              : m
          ));
          setCurrentMusic(prev => prev ? { ...prev, duration: actualDuration, isTrimmed: true } : null);

          // 再写回数据库，持久化修正
          try {
            await window.electronAPI.music.update(currentMusic.id, {
              duration: actualDuration,
              isTrimmed: true
            });
          } catch (e) {
            console.warn('修正剪辑状态写库失败:', e);
          }

          return;
        }

        // 只有对于未剪辑的音乐，且数据库时长为0时，才使用实际音频时长更新（导入时缺失）
        if (currentMusic.duration === 0) {
          console.log(`🎵 更新未剪辑音乐 ${currentMusic.name} 的时长: ${actualDuration}秒`);
          
          // 更新本地状态
          setMusicFiles(prev => prev.map(m => 
            m.id === currentMusic.id 
              ? { ...m, duration: actualDuration }
              : m
          ));
          setCurrentMusic(prev => prev ? { ...prev, duration: actualDuration } : null);
          
          // 不再写回数据库（除非初始为0的缺失场景），避免覆盖可能的剪辑时长
        }
      }
    };

    const handleError = (e: Event) => {
      const mediaError = audio.error;
      console.error('音频播放错误:', mediaError?.code, mediaError?.message, 'src:', audio.src);
      notify.error('播放失败', '无法播放该音频文件，请检查文件格式');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('error', handleError);
    };
  }, [currentMusic, isDragging, volume, isMuted, playMode]);

  // 计算当前视图下的音乐列表，用于上一首/下一首/随机选择范围
  // 需要考虑排序状态，确保上一曲/下一曲的顺序与界面显示一致
  const currentList = useMemo<MusicFile[]>(() => {
    if (!isDataLoaded || !activeView) return [];
    
    let baseList: MusicFile[] = [];
    
    if (activeView === 'all-music') {
      baseList = [...musicFiles];
    } else if (activeView === 'favorites') {
      baseList = musicFiles.filter(music => music.isFavorite);
    } else if (activeView === 'recent') {
      baseList = [...musicFiles];
    } else if (activeView === 'folders') {
      baseList = [...musicFiles];
    } else if (activeView.startsWith('playlist-')) {
      const playlistId = activeView.replace('playlist-', '');
      const playlist = playlists.find(p => p.id === playlistId);
      if (playlist) {
        // 按照播放列表中的顺序返回歌曲，保持正确的上一曲/下一曲逻辑
        const orderedMusicFiles: MusicFile[] = [];
        for (const musicId of playlist.audioFiles) {
          const musicFile = musicFiles.find(m => m.id === musicId);
          if (musicFile) {
            orderedMusicFiles.push(musicFile);
          }
        }
        baseList = orderedMusicFiles;
      }
    } else {
      baseList = [...musicFiles];
    }
    
    const manualOrder = getCurrentSortState().manualOrder;
    if (manualOrder && manualOrder.length > 0) {
      const orderedList: MusicFile[] = [];
      const musicMap = new Map(baseList.map(m => [m.id, m]));
      
      for (const id of manualOrder) {
        const music = musicMap.get(id);
        if (music) {
          orderedList.push(music);
          musicMap.delete(id);
        }
      }
      
      orderedList.push(...Array.from(musicMap.values()));
      return orderedList;
    }

    return baseList;
  }, [isDataLoaded, activeView, playlists, musicFiles, playlistSortStates]);

  // 同步音量和静音
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    if (overlapAudioRef.current) {
      overlapAudioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
    if (overlapAudioRef.current) {
      overlapAudioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // 播放音乐
  const handlePlayMusic = (music: MusicFile, options: { restartSame?: boolean } = {}) => {
    if (!audioRef.current) return;

    if (overlapAudioRef.current) {
      try { overlapAudioRef.current.pause(); } catch {}
      overlapAudioRef.current = null;
    }
    if (crossfadeTimerRef.current !== null) {
      window.clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }

    const now = Date.now();
    if (!options.restartSame && now - lastPlayActionTimeRef.current < 300) {
      return;
    }
    lastPlayActionTimeRef.current = now;

    if (currentMusic && currentMusic.id === music.id) {
      if (options.restartSame) {
        handleRestartCurrent();
        return;
      }
      handleTogglePlayPause();
      return;
    }

    audioRef.current.pause();

    setMusicFiles(prev => prev.map(m => ({ ...m, isPlaying: false })));

    setCurrentMusic(music);
    setCurrentTime(0);
    
    // 设置当前播放的歌单ID
    if (activeView.startsWith('playlist-')) {
      const playlistId = activeView.replace('playlist-', '');
      setCurrentPlayingPlaylistId(playlistId);
      console.log('正在播放歌单:', playlistId, '中的音乐:', music.name);
    } else {
      // 如果在"全部音乐"或其他视图中播放，清除歌单标记
      setCurrentPlayingPlaylistId(null);
      console.log('正在播放来自全部音乐的:', music.name);
    }
    
    try {
      // file:// 协议不支持查询参数，直接使用原始URL
      audioRef.current.src = music.url || '';
      audioRef.current.load();
      
      const handleLoadedMetadata = () => {
        audioRef.current?.play().then(() => {
          setIsPlaying(true);
          setMusicFiles(prev => prev.map(m => 
            m.id === music.id ? { ...m, isPlaying: true } : m
          ));
          
          // 移除播放提示，减少打扰
          console.log('正在播放:', music.name);
        }).catch(error => {
          console.error('播放失败:', error);
          notify.error('播放失败', error.message);
        });
      };
      
      audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    } catch (error) {
      console.error('设置音频源失败:', error);
      notify.error('音频加载失败', '无法加载音频文件');
    }
  };

  // 播放控制函数
  const handleTogglePlayPause = () => {
    if (!audioRef.current || !currentMusic) return;

    const newPlayingState = !isPlaying;
    
    if (isPlaying) {
      audioRef.current.pause();
      if (overlapAudioRef.current) overlapAudioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
      if (overlapAudioRef.current) overlapAudioRef.current.play().catch(console.error);
    }
    
    setIsPlaying(newPlayingState);
    // 同步更新 musicFiles 数组中的 isPlaying 状态
    setMusicFiles(prev => prev.map(m => 
      m.id === currentMusic.id ? { ...m, isPlaying: newPlayingState } : { ...m, isPlaying: false }
    ));
  };

  const handleRestartCurrent = () => {
    if (!audioRef.current || !currentMusic) return;

    if (overlapAudioRef.current) {
      try { overlapAudioRef.current.pause(); } catch {}
      overlapAudioRef.current = null;
    }
    if (crossfadeTimerRef.current !== null) {
      window.clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }

    audioRef.current.currentTime = 0;
    audioRef.current.volume = isMuted ? 0 : volume;
    audioRef.current.muted = isMuted;
    setCurrentTime(0);

    audioRef.current.play().then(() => {
      setIsPlaying(true);
      setMusicFiles(prev => prev.map(m => (
        m.id === currentMusic.id ? { ...m, isPlaying: true } : { ...m, isPlaying: false }
      )));
    }).catch(error => {
      console.error('从头播放失败:', error);
      notify.error('播放失败', '无法从头播放当前歌曲');
    });
  };

  const handleStop = () => {
    if (!audioRef.current) return;
    
    audioRef.current.pause();
    if (overlapAudioRef.current) {
      try { overlapAudioRef.current.pause(); } catch {}
      overlapAudioRef.current = null;
    }
    if (crossfadeTimerRef.current !== null) {
      window.clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    
    if (currentMusic) {
      setMusicFiles(prev => prev.map(m => 
        m.id === currentMusic.id ? { ...m, isPlaying: false } : m
      ));
    }
    
    // 注意：这里不清除 currentPlayingPlaylistId，保持播放歌单的记录
    // 只有在播放新音乐时才会更新播放歌单
  };

  const startCrossfadeTo = (target: MusicFile) => {
    if (!audioRef.current) return;
    const current = audioRef.current;

    if (overlapAudioRef.current) {
      try { overlapAudioRef.current.pause(); } catch {}
      overlapAudioRef.current = null;
    }
    if (crossfadeTimerRef.current !== null) {
      window.clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }

    const nextAudio = new Audio();
    nextAudio.src = target.url || '';
    nextAudio.preload = 'auto';
    nextAudio.volume = 0;
    nextAudio.muted = isMuted;
    overlapAudioRef.current = nextAudio;

    const crossfadeMs = 3000;
    const steps = 60;
    const stepDuration = crossfadeMs / steps;
    const currentStart = current.volume;
    const targetVolume = isMuted ? 0 : volume;
    let step = 0;

    nextAudio.currentTime = 0;
    nextAudio.play().catch(console.error);

    crossfadeTimerRef.current = window.setInterval(() => {
      step += 1;
      const progress = Math.min(1, step / steps);
      if (!current.paused) current.volume = Math.max(0, currentStart * (1 - progress));
      nextAudio.volume = Math.min(targetVolume, targetVolume * progress);

      if (progress >= 1) {
        if (crossfadeTimerRef.current !== null) {
          window.clearInterval(crossfadeTimerRef.current);
          crossfadeTimerRef.current = null;
        }
        try { current.pause(); } catch {}
        setCurrentMusic(target);
        current.src = target.url || '';
        current.volume = targetVolume;
        current.muted = isMuted;
        const handoffTime = nextAudio.currentTime || 0;
        const handleLoaded = () => {
          const duration = Number.isFinite(current.duration) ? current.duration : handoffTime;
          const seekTime = Math.min(handoffTime, Math.max(0, duration - 0.1));
          current.currentTime = Math.max(0, seekTime);
          setCurrentTime(current.currentTime);
          current.play().catch(console.error).finally(() => {
            try { nextAudio.pause(); } catch {}
            overlapAudioRef.current = null;
          });
          current.removeEventListener('loadedmetadata', handleLoaded);
        };
        current.addEventListener('loadedmetadata', handleLoaded);
        current.load();
        setIsPlaying(true);
        setMusicFiles(prev => prev.map(m => ({ ...m, isPlaying: m.id === target.id })));
      }
    }, stepDuration);
  };

  const handlePrevious = () => {
    if (!currentMusic || currentList.length === 0) return;
    const currentIndex = currentList.findIndex(m => m.id === currentMusic.id);
    console.log(`🎵 上一曲: 当前歌曲索引 ${currentIndex}/${currentList.length - 1}, 当前歌曲: ${currentMusic.name}`);
    
    const target = currentIndex > 0
      ? currentList[currentIndex - 1]
      : (playMode === 'loop' && currentList.length > 0 ? currentList[currentList.length - 1] : null);
    
    if (!target) {
      console.log('🚫 没有上一曲可播放');
      return;
    }
    
    console.log(`🎵 切换到上一曲: ${target.name} (索引: ${currentIndex - 1 >= 0 ? currentIndex - 1 : currentList.length - 1})`);
    
    if (isOverlapEnabled && audioRef.current && isPlaying) {
      startCrossfadeTo(target);
    } else {
      handlePlayMusic(target);
    }
  };

  const handleNext = () => {
    if (!currentMusic || currentList.length === 0) return;
    const currentIndex = currentList.findIndex(m => m.id === currentMusic.id);
    console.log(`🎵 下一曲: 当前歌曲索引 ${currentIndex}/${currentList.length - 1}, 当前歌曲: ${currentMusic.name}`);

    // 备注：手动"下一首"应始终跳转到下一曲目，单曲循环仅影响自动结束后的行为

    let target: MusicFile | null = null;
    let targetIndex = -1;

    if (playMode === 'shuffle') {
      const randomIndex = Math.floor(Math.random() * currentList.length);
      target = currentList[randomIndex];
      targetIndex = randomIndex;
      console.log(`🔀 随机模式: 跳转到随机歌曲 ${target.name} (索引: ${targetIndex})`);
    } else if (currentIndex >= 0 && currentIndex < currentList.length - 1) {
      target = currentList[currentIndex + 1];
      targetIndex = currentIndex + 1;
      console.log(`🎵 切换到下一曲: ${target.name} (索引: ${targetIndex})`);
    } else if (playMode === 'loop' && currentList.length > 0) {
      target = currentList[0];
      targetIndex = 0;
      console.log(`🔄 循环模式: 跳转到第一首 ${target.name} (索引: ${targetIndex})`);
    } else {
      console.log('🚫 没有下一曲可播放');
      return;
    }

    if (target) {
      if (isOverlapEnabled && audioRef.current && isPlaying) {
        startCrossfadeTo(target);
      } else {
        handlePlayMusic(target);
      }
    }
  };

  // 全局键盘快捷键：空格 播放/暂停，← 上一曲，→ 下一曲
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable = Boolean(target && (target as HTMLElement).isContentEditable);
      // 在输入框、文本域或可编辑区域内不处理
      if (tag === 'input' || tag === 'textarea' || isEditable) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlayPause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrevious();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleTogglePlayPause, handlePrevious, handleNext]);

  // 监听来自主进程的全局快捷键事件
  useEffect(() => {
    const handlePlayerToggle = () => {
      console.log('收到全局快捷键：播放/暂停');
      handleTogglePlayPause();
    };

    const handlePlayerPrevious = () => {
      console.log('收到全局快捷键：上一曲');
      handlePrevious();
    };

    const handlePlayerNext = () => {
      console.log('收到全局快捷键：下一曲');
      handleNext();
    };

    const handleVolumeUp = () => {
      console.log('收到全局快捷键：音量增加');
      const newVolume = Math.min(1, volume + 0.1);
      setVolume(newVolume);
    };

    const handleVolumeDown = () => {
      console.log('收到全局快捷键：音量减少');
      const newVolume = Math.max(0, volume - 0.1);
      setVolume(newVolume);
    };

    const handleToggleMuteShortcut = () => {
      console.log('收到全局快捷键：静音/取消静音');
      setIsMuted(!isMuted);
    };

    const handleEmergencyMute = () => {
      console.log('收到全局快捷键：紧急静音');
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsPlaying(false);
      setCurrentTime(0);
      setVolume(0);
    };

    // 注册 IPC 监听器
    if (window.electronAPI?.ipcRenderer) {
      window.electronAPI.ipcRenderer.on('player:toggle', handlePlayerToggle);
      window.electronAPI.ipcRenderer.on('player:previous', handlePlayerPrevious);
      window.electronAPI.ipcRenderer.on('player:next', handlePlayerNext);
      window.electronAPI.ipcRenderer.on('player:volumeUp', handleVolumeUp);
      window.electronAPI.ipcRenderer.on('player:volumeDown', handleVolumeDown);
      window.electronAPI.ipcRenderer.on('player:toggleMute', handleToggleMuteShortcut);
      window.electronAPI.ipcRenderer.on('player:emergencyMute', handleEmergencyMute);
    }

    return () => {
      // 清理 IPC 监听器
      if (window.electronAPI?.ipcRenderer) {
        window.electronAPI.ipcRenderer.removeAllListeners('player:toggle');
        window.electronAPI.ipcRenderer.removeAllListeners('player:previous');
        window.electronAPI.ipcRenderer.removeAllListeners('player:next');
        window.electronAPI.ipcRenderer.removeAllListeners('player:volumeUp');
        window.electronAPI.ipcRenderer.removeAllListeners('player:volumeDown');
        window.electronAPI.ipcRenderer.removeAllListeners('player:toggleMute');
        window.electronAPI.ipcRenderer.removeAllListeners('player:emergencyMute');
      }
    };
  }, [handleTogglePlayPause, handlePrevious, handleNext, volume]);

  // 监听手卡命令：上一曲/下一曲/播放暂停/音量/静音
  useEffect(() => {
    const api = window.electronAPI?.handCard;
    if (!api?.onCommand) return;

    const unsubscribe = api.onCommand((command: { action: string; value?: number }) => {
      switch (command.action) {
        case 'next':
          handleNext();
          break;
        case 'previous':
          handlePrevious();
          break;
        case 'play':
        case 'pause':
          handleTogglePlayPause();
          break;
        case 'volume': {
          if (typeof command.value === 'number') {
            const newVol = Math.max(0, Math.min(1, volume + command.value));
            handleVolumeChange(newVol);
          }
          break;
        }
        case 'mute':
          handleToggleMute();
          break;
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [volume, playMode, currentMusic, musicFiles]);

  // 音量控制
  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (newVolume > 0) {
      setIsMuted(false);
    }
  };

  const handleToggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        const newVolume = volume > 0 ? volume : 0.5;
        audioRef.current.volume = newVolume;
        setVolume(newVolume);
        setIsMuted(false);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  // 进度条控制
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    
    if (audioRef.current && currentMusic) {
      // 对于所有音乐，都使用显示的时长来计算跳转位置
      const targetTime = (currentMusic.duration || 0) * percentage;
      console.log(`进度跳转: ${percentage.toFixed(2)} -> ${targetTime.toFixed(2)}s (显示时长: ${currentMusic.duration}s)`);
      
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      
      if (isPlaying) {
        audioRef.current.play().catch(console.error);
      }
    }
  };

  const handleProgressBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    
    if (audioRef.current && currentMusic) {
      // 对于所有音乐，都使用显示的时长来计算拖拽位置
      const targetTime = (currentMusic.duration || 0) * percentage;
      console.log(`拖拽开始: ${percentage.toFixed(2)} -> ${targetTime.toFixed(2)}s (显示时长: ${currentMusic.duration}s)`);
      
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      if (isPlaying) {
        audioRef.current.play().catch(console.error);
      }
    }
  };

  const handleSliderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 使用局部变量避免闭包问题
    let isDraggingLocal = true;
    let localDragTime = currentTime;
    
    setIsDragging(true);
    setDragTime(currentTime);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingLocal) return;
      
      const rect = progressBarRef.current?.getBoundingClientRect();
      if (rect) {
        const position = (moveEvent.clientX - rect.left) / rect.width;
        const percentage = Math.max(0, Math.min(1, position));
        
        // 对于所有音乐，都使用显示的时长来计算拖拽位置
        const targetTime = (currentMusic?.duration || 0) * percentage;
        localDragTime = targetTime;
        setDragTime(targetTime);
      }
    };
    
    const handleMouseUp = () => {
      if (isDraggingLocal) {
        if (audioRef.current && currentMusic) {
          console.log(`拖拽结束: 设置时间为 ${localDragTime.toFixed(2)}s`);
          
          audioRef.current.currentTime = localDragTime;
          setCurrentTime(localDragTime);
          
          if (isPlaying) {
            audioRef.current.play().catch(console.error);
          }
        }
        isDraggingLocal = false;
        setIsDragging(false);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
  };

  // 文件管理
  const handleToggleFavorite = (musicId: string) => {
    setMusicFiles(prev => prev.map(m => 
      m.id === musicId ? { ...m, isFavorite: !m.isFavorite } : m
    ));
    
    const music = musicFiles.find(m => m.id === musicId);
    if (music) {
      // 移除收藏提示，减少打扰
      console.log(music.isFavorite ? '已取消收藏:' : '已添加收藏:', music.name);
    }
    
    if (currentMusic?.id === musicId) {
      setCurrentMusic(prev => prev ? { ...prev, isFavorite: !prev.isFavorite } : null);
    }
  };

  const handleDeleteMusic = async (musicId: string) => {
    try {
      // 调用后端删除
      await window.electronAPI.music.delete(musicId);
      
      // 更新本地状态
      setMusicFiles(prev => prev.filter(m => m.id !== musicId));
      
      // 重新加载歌单（因为可能需要更新歌单中的引用）
      const updatedPlaylists = await window.electronAPI.music.playlists.getAll();
      setPlaylists(updatedPlaylists);
      
      const music = musicFiles.find(m => m.id === musicId);
      if (music) {
        // 移除删除提示，减少打扰
        console.log('已删除:', music.name);
      }
      
      if (currentMusic?.id === musicId) {
        setCurrentMusic(null);
        setIsPlaying(false);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      }
      
      // 如果当前是歌单视图，刷新音乐列表
      if (activeView.startsWith('playlist-')) {
        const updatedMusic = await window.electronAPI.music.getAll();
        const converted = updatedMusic.map((audioFile: any) => ({
          id: audioFile.id,
          name: audioFile.displayName || audioFile.fileName || 'Unknown',
          artist: audioFile.artist,
          album: audioFile.album,
          duration: audioFile.duration,
          fileSize: audioFile.fileSize,
          format: audioFile.format,
          isPlaying: false,
          isFavorite: audioFile.isFavorite,
          isTrimmed: audioFile.isTrimmed || false,
          addedTime: new Date(audioFile.addedTime),
          url: audioFile.filePath ? filePathToFileURL(audioFile.filePath) : '',
          file: null as any,
          filePath: audioFile.filePath,
          fileName: audioFile.fileName,
          displayName: audioFile.displayName,
          bitrate: audioFile.bitrate,
          sampleRate: audioFile.sampleRate,
          lastPlayTime: audioFile.lastPlayTime ? new Date(audioFile.lastPlayTime) : undefined,
          playCount: audioFile.playCount,
          customTags: audioFile.customTags,
          thumbnailPath: audioFile.thumbnailPath
        }));
        setMusicFiles(converted);
      }
    } catch (error) {
      console.error('删除音乐失败:', error);
      notify.error('删除失败', '无法删除音乐文件');
    }
  };

  const handleRenameMusic = async (musicId: string, newName: string) => {
    // 先保存原始名称，以便在失败时恢复
    const originalMusic = musicFiles.find(m => m.id === musicId);
    const originalName = originalMusic?.name || '';
    
    try {
      console.log(`🎵 重命名歌曲: ${musicId} -> ${newName} (原名: ${originalName})`);
      
      // 更新本地状态
      setMusicFiles(prev => prev.map(m => 
        m.id === musicId ? { ...m, name: newName } : m
      ));
      
      if (currentMusic?.id === musicId) {
        setCurrentMusic(prev => prev ? { ...prev, name: newName } : null);
      }
      
      // 保存到数据库 - 使用 displayName 字段
      await window.electronAPI.music.update(musicId, {
        displayName: newName
      });
      
      console.log(`✅ 歌曲重命名已保存到数据库: ${newName}`);
      // 移除成功提示，避免过度打扰用户，控制台日志已足够
      
    } catch (error) {
      console.error('重命名歌曲失败:', error);
      notify.error('重命名失败', '无法保存歌曲名称，请重试');
      
      // 如果保存失败，恢复原来的名称
      setMusicFiles(prev => prev.map(m => 
        m.id === musicId ? { ...m, name: originalName } : m
      ));
      
      if (currentMusic?.id === musicId) {
        setCurrentMusic(prev => prev ? { ...prev, name: originalName } : null);
      }
    }
  };

  // 导入文件
  const handleImportFiles = async (files: File[]) => {
    console.log('开始导入文件:', files.length, '个文件');
    
    // 过滤出音频文件
    const audioFiles = files.filter(file => {
      const fileType = file.type;
      const fileName = file.name.toLowerCase();
      return fileType.startsWith('audio/') || 
             fileName.endsWith('.mp3') || 
             fileName.endsWith('.wav') || 
             fileName.endsWith('.flac') || 
             fileName.endsWith('.m4a') || 
             fileName.endsWith('.aac') || 
             fileName.endsWith('.ogg') ||
             fileName.endsWith('.wma') ||
             fileName.endsWith('.opus');
    });

    if (audioFiles.length === 0) {
      notify.warning('不支持的文件格式', '请选择音频文件（MP3, WAV, FLAC, M4A, AAC, OGG, WMA, OPUS）');
      return;
    }

    if (audioFiles.length < files.length) {
      const skippedCount = files.length - audioFiles.length;
      // 只在有跳过文件时显示警告提示
      notify.warning('部分文件已跳过', `跳过了 ${skippedCount} 个非音频文件，将导入 ${audioFiles.length} 个音频文件`);
    }
    
    const musicAPI = window.electronAPI?.music;
    
    try {
      if (!musicAPI) {
        throw new Error('音乐API不可用');
      }

      // 转换File对象为AudioFile格式
      const musicFilesToAdd: any[] = [];
      
      for (const file of audioFiles) {
        try {
          // 获取文件路径
          let filePath = (file as any).path;
          
          if (!filePath && (file as any).webkitRelativePath) {
            filePath = (file as any).webkitRelativePath;
          }
          
          if (!filePath) {
            filePath = file.name;
            console.warn(`文件 ${file.name} 没有完整路径，使用文件名作为路径`);
          }

          // 标准化路径，确保跨平台兼容性
          // Windows: C:\path\to\file -> C:/path/to/file
          // macOS/Linux: /path/to/file (保持不变)
          if (typeof filePath === 'string') {
            filePath = filePath.replace(/\\/g, '/');
            
            // 处理Windows驱动器路径 (如 C: -> C:/)
            if (/^[A-Za-z]:(?![\/\\])/.test(filePath)) {
              filePath = filePath.substring(0, 2) + '/' + filePath.substring(2);
            }
          }
          
          console.log(`处理文件: ${file.name}, 原始路径: ${(file as any).path}, 标准化路径: ${filePath}, 文件大小: ${file.size} bytes`);

          // 尝试读取音频元数据，确保在Windows上也能正常工作
          let metadata = { 
            title: file.name.replace(/\.[^/.]+$/, ''), // 默认标题为不带扩展名的文件名
            artist: '', 
            album: '', 
            duration: 0,
            bitrate: 0,
            sampleRate: 0,
            channels: 0,
            year: null as number | null,
            genre: ''
          };
          
          try {
            console.log(`开始读取 ${file.name} 的元数据...`);
            const audioMetadata = await readAudioMetadata(file);
            
            // 安全地提取元数据，避免undefined值
            metadata = {
              title: audioMetadata.title || file.name.replace(/\.[^/.]+$/, ''),
              artist: audioMetadata.artist || '',
              album: audioMetadata.album || '',
              duration: audioMetadata.duration || 0,
              bitrate: audioMetadata.bitrate || 0,
              sampleRate: audioMetadata.sampleRate || 0,
              channels: audioMetadata.channels || 0,
              year: audioMetadata.year || null,
              genre: audioMetadata.genre ? audioMetadata.genre.join(', ') : ''
            };
            
            console.log(`${file.name} 元数据读取成功:`, metadata);
          } catch (metadataError) {
            console.warn(`读取文件 ${file.name} 的元数据失败，使用默认值:`, metadataError);
            // 使用默认值，不阻止文件导入
          }

          const musicFile = {
            id: `music_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            filePath: filePath,
            fileName: file.name,
            // 显示名固定为文件名（不含扩展名）
            displayName: file.name.replace(/\.[^/.]+$/, ''),
            artist: metadata.artist || '',
            album: metadata.album || '',
            duration: metadata.duration || 0,
            fileSize: file.size,
            format: file.name.split('.').pop()?.toLowerCase() || 'unknown',
            bitrate: metadata.bitrate || 0,
            sampleRate: metadata.sampleRate || 0,
            addedTime: new Date(),
            playCount: 0,
            isFavorite: false,
            customTags: metadata.genre ? [metadata.genre] : [],
            thumbnailPath: null
          };
          
          musicFilesToAdd.push(musicFile);
          console.log(`文件 ${file.name} 处理完成，准备导入`);
        } catch (fileError) {
          console.error(`处理文件 ${file.name} 时出错:`, fileError);
          
          // 提供更详细的错误信息，帮助调试Windows兼容性问题
          if (fileError instanceof Error) {
            if (fileError.message.includes('权限') || fileError.message.includes('permission')) {
              console.error(`文件权限问题: ${file.name}`);
            } else if (fileError.message.includes('格式') || fileError.message.includes('format')) {
              console.error(`文件格式问题: ${file.name}`);
            } else if (fileError.message.includes('大小') || fileError.message.includes('size')) {
              console.error(`文件大小问题: ${file.name}`);
            } else if (fileError.message.includes('路径') || fileError.message.includes('path')) {
              console.error(`文件路径问题: ${file.name}, 路径: ${(file as any).path}`);
            }
          }
          
          // 单个文件失败不应阻止其他文件的导入
        }
      }

      console.log('准备添加音乐文件到数据库:', musicFilesToAdd.length, '个');

      if (musicFilesToAdd.length > 0) {
        try {
          const result = await musicAPI.addBatch(musicFilesToAdd);
          console.log('批量添加结果:', result);
        
          // 决定目标歌单
          let targetPlaylistId = '';
          if (activeView.startsWith('playlist-')) {
            targetPlaylistId = activeView.replace('playlist-', '');
          } else {
            const defaultPlaylist = await musicAPI.playlists.getDefault();
            targetPlaylistId = defaultPlaylist.id;
          }
          
          const musicIds = musicFilesToAdd.map(m => m.id);
          await musicAPI.playlists.addMusicBatch(targetPlaylistId, musicIds);
          
          // 重新加载数据
          const updatedMusic = await musicAPI.getAll();
          const updatedPlaylists = await musicAPI.playlists.getAll();
          console.log('导入后重新加载的音乐数据:', updatedMusic);
          console.log('导入后重新加载的歌单数据:', updatedPlaylists);
          
          const convertedUpdatedMusic = updatedMusic.map((audioFile: any) => ({
            id: audioFile.id,
            name: audioFile.displayName || audioFile.fileName || 'Unknown',
            artist: audioFile.artist,
            album: audioFile.album,
            duration: audioFile.duration,
            fileSize: audioFile.fileSize,
            format: audioFile.format,
            isPlaying: false,
            isFavorite: audioFile.isFavorite,
            isTrimmed: audioFile.isTrimmed || false,
            addedTime: new Date(audioFile.addedTime),
            url: audioFile.filePath ? filePathToFileURL(audioFile.filePath) : '',
            file: null as any,
            filePath: audioFile.filePath,
            fileName: audioFile.fileName,
            displayName: audioFile.displayName,
            bitrate: audioFile.bitrate,
            sampleRate: audioFile.sampleRate,
            lastPlayTime: audioFile.lastPlayTime ? new Date(audioFile.lastPlayTime) : undefined,
            playCount: audioFile.playCount,
            customTags: audioFile.customTags,
            thumbnailPath: audioFile.thumbnailPath
          }));
          
          setMusicFiles(convertedUpdatedMusic);
          setPlaylists(updatedPlaylists);
          
          // 移除导入成功提示，减少打扰
          console.log(`导入成功: 已导入 ${musicFilesToAdd.length} 个文件`);
        } catch (error) {
          console.error('=== 导入失败详细信息 ===');
          console.error('错误对象:', error);
          console.error('错误消息:', error instanceof Error ? error.message : String(error));
          console.error('错误堆栈:', error instanceof Error ? error.stack : 'N/A');
          console.error('平台信息:', navigator.platform);
          console.error('尝试导入的文件数量:', musicFilesToAdd.length);
          
          let dbErrorMessage = '无法保存导入的音乐文件';
          if (error instanceof Error) {
            if (error.message.includes('SQLITE_BUSY') || error.message.includes('database is locked')) {
              dbErrorMessage = '数据库忙碌，请稍后重试';
            } else if (error.message.includes('SQLITE_READONLY') || error.message.includes('readonly')) {
              dbErrorMessage = '数据库只读，请检查文件权限';
            } else if (error.message.includes('SQLITE_CORRUPT') || error.message.includes('corrupt')) {
              dbErrorMessage = '数据库文件损坏，请重新安装应用';
            } else if (error.message.includes('no such table') || error.message.includes('no such column')) {
              dbErrorMessage = '数据库结构异常，请重新安装应用';
            } else if (error.message.includes('permission') || error.message.includes('权限')) {
              dbErrorMessage = '文件权限不足，请以管理员身份运行';
            }
          }
          
          notify.error('导入失败', dbErrorMessage);
        }
      }
    } catch (error) {
      console.error('=== 音乐文件导入失败详细信息 ===');
      console.error('错误对象:', error);
      console.error('错误消息:', error instanceof Error ? error.message : String(error));
      console.error('错误堆栈:', error instanceof Error ? error.stack : 'N/A');
      console.error('平台信息:', navigator.platform);
      console.error('输入文件数量:', audioFiles.length);
      console.error('音乐API可用性:', {
        musicAPI: !!musicAPI,
        addBatch: !!musicAPI?.addBatch,
        playlists: !!musicAPI?.playlists,
        getDefault: !!musicAPI?.playlists?.getDefault
      });
      
      let importErrorMessage = '导入音乐文件失败';
      if (error instanceof Error) {
        if (error.message.includes('音乐API不可用')) {
          importErrorMessage = '音乐API不可用，请重启应用';
        } else if (error.message.includes('权限') || error.message.includes('permission')) {
          importErrorMessage = '文件权限不足，请以管理员身份运行';
        } else if (error.message.includes('路径') || error.message.includes('path')) {
          importErrorMessage = '文件路径错误，请检查文件是否存在';
        } else if (error.message.includes('格式') || error.message.includes('format')) {
          importErrorMessage = '不支持的音频格式';
        } else if (error.message.includes('database') || error.message.includes('数据库')) {
          importErrorMessage = '数据库错误，请重启应用';
        } else {
          importErrorMessage = error.message;
        }
      }
      
      notify.error('导入失败', importErrorMessage);
    }
  };

  const handleImportFolder = async (folderPath: string) => {
    try {
      // 移除扫描提示，减少打扰
      console.log('正在扫描文件夹:', folderPath);
      
      // 使用主进程扫描文件夹中的音频文件
      if (!window.electronAPI?.fs?.scanAudioFiles) {
        throw new Error('文件夹扫描功能不可用');
      }
      
      const audioFilePaths = await window.electronAPI.fs.scanAudioFiles(folderPath);
      
      if (audioFilePaths.length === 0) {
        notify.warning('文件夹导入', '该文件夹中没有找到音频文件');
        return;
      }
      
      // 移除导入进度提示，减少打扰
      console.log(`找到 ${audioFilePaths.length} 个音频文件，正在导入...`);
      
      // 转换为File对象
      const filesWithPaths = audioFilePaths.map((filePath: string) => {
        // 使用跨平台的路径处理
        const fileName = filePath.replace(/\\/g, '/').split('/').pop() || 'unknown';
        
        // 创建包含path属性的File对象
        const fileWithPath = new File([], fileName, { 
          type: `audio/${fileName.split('.').pop()?.toLowerCase() || 'unknown'}` 
        });
        
        // 添加path属性
        Object.defineProperty(fileWithPath, 'path', {
          value: filePath,
          writable: false,
          enumerable: true
        });
        
        return fileWithPath;
      });
      
      // 调用现有的文件导入逻辑
      await handleImportFiles(filesWithPaths);
      
      // 移除导入成功提示，减少打扰
      console.log(`文件夹导入成功: ${audioFilePaths.length} 个音频文件`);
    } catch (error) {
      console.error('文件夹导入失败:', error);
      notify.error('文件夹导入失败', error instanceof Error ? error.message : '未知错误');
    }
  };

  // 播放列表管理
  const handleCreatePlaylist = async (name: string, description: string, coverColor: string, coverIcon: string) => {
    try {
      console.log('开始创建播放列表:', name);
      
      const newPlaylist = await window.electronAPI.music.playlists.create({
        name,
        description,
        isDefault: false,
        sortOrder: 'added_time_desc', // 🔧 修复：使用字符串而不是枚举
        coverColor,
        coverIcon,
        songCount: 0,
        totalDuration: 0
      });
      
      // 🔧 修复：验证返回结果
      if (!newPlaylist) {
        console.error('播放列表创建返回了null结果');
        throw new Error('播放列表创建失败：服务器返回空结果');
      }
      
      if (!newPlaylist.id) {
        console.error('播放列表创建返回了无效结果:', newPlaylist);
        throw new Error('播放列表创建失败：返回结果缺少ID');
      }
      
      console.log('播放列表创建成功:', newPlaylist);
      
      // 重新加载歌单数据
      const updatedPlaylists = await window.electronAPI.music.playlists.getAll();
      setPlaylists(updatedPlaylists);
      
      // 移除创建成功提示，减少打扰
      console.log(`播放列表创建成功: "${name}" (ID: ${newPlaylist.id})`);
      notify.success('创建成功', `播放列表 "${name}" 已创建`);
    } catch (error) {
      console.error('创建歌单失败:', error);
      
      // 提供更详细的错误信息
      let errorMessage = '无法创建播放列表';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      notify.error('创建失败', errorMessage);
    }
  };

  const handlePlaylistSelect = (playlistId: string) => {
    console.log('选择播放列表:', playlistId);
    setActiveView(`playlist-${playlistId}`);
  };

  // 添加音乐到歌单
  const handleAddToPlaylist = async (musicId: string, playlistId: string) => {
    try {
      await window.electronAPI.music.playlists.addMusic(playlistId, musicId);
      
      const updatedPlaylists = await window.electronAPI.music.playlists.getAll();
      setPlaylists(updatedPlaylists);
      
      // 刷新当前视图如果需要
      if (activeView === `playlist-${playlistId}`) {
        const updatedMusic = await window.electronAPI.music.getAll();
        const converted = updatedMusic.map((audioFile: any) => ({
          id: audioFile.id,
          name: audioFile.displayName || audioFile.fileName || 'Unknown',
          artist: audioFile.artist,
          album: audioFile.album,
          duration: audioFile.duration,
          fileSize: audioFile.fileSize,
          format: audioFile.format,
          isPlaying: false,
          isFavorite: audioFile.isFavorite,
          isTrimmed: audioFile.isTrimmed || false,
          addedTime: new Date(audioFile.addedTime),
          url: audioFile.filePath ? filePathToFileURL(audioFile.filePath) : '',
          file: null as any, // 数据库中没有File对象
          // 数据库字段
          filePath: audioFile.filePath,
          fileName: audioFile.fileName,
          displayName: audioFile.displayName,
          bitrate: audioFile.bitrate,
          sampleRate: audioFile.sampleRate,
          lastPlayTime: audioFile.lastPlayTime ? new Date(audioFile.lastPlayTime) : undefined,
          playCount: audioFile.playCount,
          customTags: audioFile.customTags,
          thumbnailPath: audioFile.thumbnailPath
        }));
        setMusicFiles(converted);
      }
      
      // 移除添加成功提示，减少打扰
      console.log('音乐已添加到歌单');
    } catch (error) {
      console.error('添加到歌单失败:', error);
      notify.error('添加失败', '无法将音乐添加到歌单');
    }
  };

  // 从歌单移除音乐
  const handleRemoveFromPlaylist = async (musicId: string, playlistId: string) => {
    try {
      await window.electronAPI.music.playlists.removeMusic(playlistId, musicId);
      
      const updatedPlaylists = await window.electronAPI.music.playlists.getAll();
      setPlaylists(updatedPlaylists);
      
      // 刷新当前视图
      if (activeView === `playlist-${playlistId}`) {
        const updatedMusic = await window.electronAPI.music.getAll();
        const converted = updatedMusic.map((audioFile: any) => ({
          id: audioFile.id,
          name: audioFile.displayName || audioFile.fileName || 'Unknown',
          artist: audioFile.artist,
          album: audioFile.album,
          duration: audioFile.duration,
          fileSize: audioFile.fileSize,
          format: audioFile.format,
          isPlaying: false,
          isFavorite: audioFile.isFavorite,
          isTrimmed: audioFile.isTrimmed || false,
          addedTime: new Date(audioFile.addedTime),
          url: audioFile.filePath ? filePathToFileURL(audioFile.filePath) : '',
          file: null as any, // 数据库中没有File对象
          // 数据库字段
          filePath: audioFile.filePath,
          fileName: audioFile.fileName,
          displayName: audioFile.displayName,
          bitrate: audioFile.bitrate,
          sampleRate: audioFile.sampleRate,
          lastPlayTime: audioFile.lastPlayTime ? new Date(audioFile.lastPlayTime) : undefined,
          playCount: audioFile.playCount,
          customTags: audioFile.customTags,
          thumbnailPath: audioFile.thumbnailPath
        }));
        setMusicFiles(converted);
      }
      
      // 移除移除成功提示，减少打扰
      console.log('音乐已从歌单移除');
    } catch (error) {
      console.error('从歌单移除失败:', error);
      notify.error('移除失败', '无法从歌单移除音乐');
    }
  };

  const handleSearch = (query: string) => {
    console.log('搜索:', query);
    setSearchQuery(query);
  };

  const handleViewModeChange = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    
    // 持久化保存视图模式偏好
    try {
      localStorage.setItem('wedding-music-player-view-mode', mode);
      console.log('视图模式偏好已保存:', mode);
    } catch (error) {
      console.warn('无法保存视图模式偏好:', error);
    }
  };

  const handleRecordingComplete = (recording: any) => {
    console.log('录音完成:', recording);
    // 移除录音完成提示，减少打扰
  };

  // 处理开始录音配置
  const handleStartRecording = (options: any) => {
    setShowRecordingModal(true);
  };

  // 处理录音配置确认
  const handleRecordingStart = async (options: any) => {
    try {
      setShowRecordingModal(false);
      if (window.electronAPI?.consoleRecording?.start) {
        const result = await window.electronAPI.consoleRecording.start(options);
        if (!result.success) {
          notify.error('录音失败', result.error || '未知错误');
        }
        // 移除录音开始提示，减少打扰
      }
    } catch (error) {
      console.error('开始录音失败:', error);
      notify.error('录音失败', '无法开始录音');
    }
  };

  const handleClearLibrary = async () => {
    try {
      // Optional: ask for confirmation
      const confirmed = window.confirm('确定要清除所有音乐数据吗？此操作不可逆！');
      if (!confirmed) return;

      await window.electronAPI.music.clearAll();
      setMusicFiles([]);
      setPlaylists(prev => prev.filter(p => !p.isDefault)); // Keep default playlist
      setCurrentMusic(null);
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.src = '';
      }
      // 移除清除成功提示，减少打扰
      console.log('音乐库已清除');
      // Reload data to get fresh default playlist etc.
      const playlistData = await window.electronAPI.music.playlists.getAll();
      setPlaylists(playlistData);

    } catch (error) {
      console.error('清除音乐库失败:', error);
      notify.error('操作失败', '无法清除音乐库');
    }
  };

  // 重命名歌单
  const handleRenamePlaylist = async (playlistId: string, newName: string) => {
    try {
      await window.electronAPI.music.playlists.update(playlistId, {
        name: newName,
        updatedTime: new Date()
      });

      const updatedPlaylists = await window.electronAPI.music.playlists.getAll();
      setPlaylists(updatedPlaylists);
      console.log('播放列表已重命名:', playlistId, newName);
    } catch (error) {
      console.error('重命名歌单失败:', error);
      notify.error('重命名失败', '无法更新播放列表名称');
    }
  };

  // 删除歌单
  const handleDeletePlaylist = async (playlistId: string) => {
    try {
      await window.electronAPI.music.playlists.delete(playlistId);
      // 更新本地状态
      const updatedPlaylists = await window.electronAPI.music.playlists.getAll();
      setPlaylists(updatedPlaylists);

      // 如果当前视图正在查看被删除的歌单，切换到默认歌单
      if (activeView === `playlist-${playlistId}`) {
        const defaultPlaylist = updatedPlaylists.find(p => p.isDefault);
        if (defaultPlaylist) {
          setActiveView(`playlist-${defaultPlaylist.id}`);
        } else {
          setActiveView('all-music');
        }
      }

      // 移除删除成功提示，减少打扰
      console.log('播放列表已删除');
    } catch (error) {
      console.error('删除歌单失败:', error);
      notify.error('删除失败', '无法删除播放列表');
    }
  };

  // 根据搜索查询过滤音乐列表
  const filterMusicBySearch = (music: MusicFile[]): MusicFile[] => {
    if (!searchQuery.trim()) {
      return music;
    }
    
    const query = searchQuery.toLowerCase().trim();
    return music.filter(file => 
      file.name.toLowerCase().includes(query) ||
      file.displayName?.toLowerCase().includes(query) ||
      file.fileName?.toLowerCase().includes(query) ||
      file.artist?.toLowerCase().includes(query) ||
      file.album?.toLowerCase().includes(query)
    );
  };

  // 获取当前视图应该显示的音乐列表
  const getCurrentMusicList = (): MusicFile[] => {
    if (!isDataLoaded || !activeView) return [];
    
    let baseMusicList: MusicFile[] = [];
    
    if (activeView === 'all-music') {
      baseMusicList = musicFiles;
    } else if (activeView === 'favorites') {
      baseMusicList = musicFiles.filter(music => music.isFavorite);
    } else if (activeView === 'recent') {
      // 这里可以根据最后播放时间排序，暂时返回全部音乐
      baseMusicList = musicFiles;
    } else if (activeView === 'folders') {
      // 文件夹视图，暂时返回全部音乐
      baseMusicList = musicFiles;
    } else if (activeView.startsWith('playlist-')) {
      const playlistId = activeView.replace('playlist-', '');
      const playlist = playlists.find(p => p.id === playlistId);
      if (playlist) {
        // 🔧 关键修复：按照播放列表中的audioFiles顺序返回音乐，而不是按musicFiles的顺序
        const uniqueAudioFileIds = [...new Set(playlist.audioFiles)]; // 去除重复的ID
        const musicMap = new Map(musicFiles.map(m => [m.id, m]));
        
        // 按照playlist.audioFiles的顺序构建音乐列表
        baseMusicList = uniqueAudioFileIds
          .map(id => musicMap.get(id))
          .filter((music): music is MusicFile => music !== undefined);
      } else {
        baseMusicList = musicFiles;
      }
    } else {
      baseMusicList = musicFiles;
    }
    
    // 应用搜索过滤
    const filteredList = filterMusicBySearch(baseMusicList);
    
    // 应用当前视图的排序状态
    return applySortingToMusicList(filteredList);
  };

  // 只保留手动排序：没有手动顺序时保持歌单原顺序。
  const applySortingToMusicList = (musicList: MusicFile[]): MusicFile[] => {
    const manualOrder = getCurrentSortState().manualOrder;
    if (!manualOrder || manualOrder.length === 0) {
      return musicList;
    }

    const orderedList: MusicFile[] = [];
    const musicMap = new Map(musicList.map(m => [m.id, m]));

    for (const id of manualOrder) {
      const music = musicMap.get(id);
      if (music) {
        orderedList.push(music);
        musicMap.delete(id);
      }
    }

    return [...orderedList, ...Array.from(musicMap.values())];
  };

  // 获取当前视图的标题
  const getCurrentViewTitle = (): string => {
    // 如果在音频编辑器模块，返回相应标题
    if (activeModule === 'audio-editor') {
      return audioEditorMusicId ? '剪辑音乐' : '音频编辑器';
    }
    
    if (!activeView) return '音乐库';
    if (activeView === 'all-music') return '全部音乐';
    if (activeView === 'favorites') return '我的收藏';
    if (activeView === 'recent') return '最近播放';
    if (activeView === 'folders') return '文件夹';
    if (activeView.startsWith('playlist-')) {
      const playlistId = activeView.replace('playlist-', '');
      const playlist = playlists.find(p => p.id === playlistId);
      return playlist ? playlist.name : '歌单';
    }
    return '音乐库';
  };

  const renderMainContent = () => {
    switch (activeModule) {
      case 'music-playback':
        return (
          <>
            <div 
              className="p-4 pt-2 bg-gray-50 dark:bg-gray-900 min-h-full"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) {
                  handleImportFiles(files);
                }
              }}
            >
              {/* 录音状态提示条 */}
              {isGlobalRecording && (
                <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-red-700 dark:text-red-300">
                        控台录音进行中 - {formatRecordingTime(globalRecordingTime)}
                      </span>
                      <span className="text-xs text-red-600 dark:text-red-400">
                        (可同时播放音乐)
                      </span>
                    </div>
                    <button
                      onClick={handleGlobalStopRecording}
                      className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded transition-colors"
                    >
                      停止录音
                    </button>
                  </div>
                </div>
              )}
              
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {getCurrentViewTitle()}
                  </h1>
                  {/* 显示正在播放的歌单信息 */}
                  {currentMusic && currentPlayingPlaylistId && isPlaying && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 rounded-full">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-green-700 dark:text-green-400 font-medium">
                        正在播放来自: {getCurrentPlayingPlaylist()?.name || '未知歌单'}
                      </span>
                    </div>
                  )}
                </div>

                {/* 右侧操作按钮区域 */}
                <div className="flex items-center space-x-2">
                  {/* 播放模式文字按钮 */}
                  <button
                    onClick={handleTogglePlayMode}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                  >
                    {playMode === 'sequential' && '顺序播放'}
                    {playMode === 'loop' && '列表循环'}
                    {playMode === 'single' && '单曲循环'}
                    {playMode === 'shuffle' && '随机播放'}
                  </button>

                  <div className="flex items-center space-x-2 bg-gray-200/70 dark:bg-gray-800/60 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-700 dark:text-gray-300">歌曲重叠</span>
                    <button
                      onClick={() => setIsOverlapEnabled((prev: boolean) => !prev)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 ${
                        isOverlapEnabled ? 'bg-blue-600' : 'bg-gray-400 dark:bg-gray-600'
                      }`}
                      title="开启后，按上一首/下一首将进行3秒重叠过渡"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isOverlapEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* 导入音乐按钮 */}
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                  >
                    导入音乐
                  </button>
                </div>
              </div>
              
              <ImprovedMusicList
                musicFiles={applySortingToMusicList(getCurrentMusicList())}
                currentMusic={currentMusic}
                isPlaying={isPlaying}
                viewMode={viewMode}
                onPlayMusic={handlePlayMusic}
                onToggleFavorite={handleToggleFavorite}
                onDeleteMusic={handleDeleteMusic}
                onRenameMusic={handleRenameMusic}
                onAddToPlaylist={handleAddToPlaylist}
                onRemoveFromPlaylist={handleRemoveFromPlaylist}
                playlists={playlists}
                currentPlaylistId={activeView.startsWith('playlist-') ? activeView.replace('playlist-', '') : undefined}
                onReorder={handleReorder}
                highlightedId={highlightedId}
                onImportFiles={handleImportFiles}
                isManualSortMode={isManualSortMode}
                onStartManualSort={handleStartManualSort}
                onFinishManualSort={handleFinishManualSort}
                onCancelManualSort={handleCancelManualSort}
              />
            </div>
          </>
        );
      case 'console-recording':
        return (
          <div className="flex-1 bg-gray-50 dark:bg-gray-900 p-4 pt-2">
            <div className="max-w-4xl mx-auto">
              <ConsoleRecordingControl 
                onStartRecording={handleStartRecording}
                isGlobalRecording={isGlobalRecording}
                globalRecordingTime={globalRecordingTime}
                globalRecordingPath={globalRecordingPath}
                onGlobalStopRecording={handleGlobalStopRecording}
              />
            </div>
          </div>
        );
      case 'audio-converter':
        return (
          <div className="flex-1 bg-gray-50 dark:bg-gray-900">
            {/* 录音状态提示条 */}
            {isGlobalRecording && (
              <div className="m-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      控台录音进行中 - {formatRecordingTime(globalRecordingTime)}
                    </span>
                  </div>
                  <button
                    onClick={handleGlobalStopRecording}
                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded transition-colors"
                  >
                    停止录音
                  </button>
                </div>
              </div>
            )}
            <EnhancedMusicConverter />
          </div>
        );
      case 'vocal-remover':
        return (
          <div className="flex-1 bg-gray-50 dark:bg-gray-900">
            {/* 录音状态提示条 */}
            {isGlobalRecording && (
              <div className="m-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      控台录音进行中 - {formatRecordingTime(globalRecordingTime)}
                    </span>
                  </div>
                  <button
                    onClick={handleGlobalStopRecording}
                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded transition-colors"
                  >
                    停止录音
                  </button>
                </div>
              </div>
            )}
            <VocalRemover />
          </div>
        );
      case 'audio-editor':
        return (
          <div className="h-full min-h-full flex flex-col bg-gray-50 dark:bg-gray-900">
            {/* 录音状态提示条 */}
            {isGlobalRecording && (
              <div className="m-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      控台录音进行中 - {formatRecordingTime(globalRecordingTime)}
                    </span>
                  </div>
                  <button
                    onClick={handleGlobalStopRecording}
                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded transition-colors"
                  >
                    停止录音
                  </button>
                </div>
              </div>
            )}
            <AudioEditor
              musicId={audioEditorMusicId || undefined}
              sourcePlaylistId={audioEditorPlaylistId || undefined}
            />
          </div>
        );
      case 'favorites-notes':
        return (
          <div className="flex-1 bg-gray-50 dark:bg-gray-900 flex flex-col h-full overflow-hidden">
            {/* 录音状态提示条 */}
            {isGlobalRecording && (
              <div className="m-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      控台录音进行中 - {formatRecordingTime(globalRecordingTime)}
                    </span>
                  </div>
                  <button
                    onClick={handleGlobalStopRecording}
                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded transition-colors"
                  >
                    停止录音
                  </button>
                </div>
              </div>
            )}
            <div className="p-4 pt-2 border-b border-gray-200 dark:border-slate-700">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">收藏记录</h1>
            </div>
            <FavoritesNotesModule />
          </div>
        );
      case 'info-registration':
        return (
          <div className="flex-1 bg-gray-50 dark:bg-gray-900 p-6">
            <div className="max-w-4xl mx-auto">
              {/* 移除信息登记部分 */}
            </div>
          </div>
        );
      case 'more-features':
        return (
          <div className="flex-1 bg-gray-50 dark:bg-gray-900 p-4 pt-2">
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 dark:bg-gray-800">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">更多功能</h2>
                <p className="text-gray-600 dark:text-gray-400">高级功能和设置选项正在开发中，敬请期待...</p>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="flex-1 bg-gray-50 dark:bg-gray-900 p-4 pt-2">
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 dark:bg-gray-800">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">功能开发中</h2>
                <p className="text-gray-600 dark:text-gray-400">该功能正在开发中，敬请期待...</p>
              </div>
            </div>
          </div>
        );
    }
  };

  const [userName, setUserName] = useState<string>('婚礼主持人');
  const [userBio, setUserBio] = useState<string>('专业音频工具\n用于婚礼音乐管理和编辑');
  const [userAvatar, setUserAvatar] = useState<string>('');
  const [userDataLoaded, setUserDataLoaded] = useState(false); // 标记数据是否已加载

  // Load user data on mount (优先使用 Electron storage，其次 localStorage)
  useEffect(() => {
    let cancelled = false;

    const loadUserData = async () => {
      console.log('🔄 开始加载用户数据...');
      try {
        // 优先从主进程的 electron-store 读取，打包后更可靠
        if ((window as any).electronAPI?.storage?.get) {
          const saved = await (window as any).electronAPI.storage.get('userData');
          if (!cancelled && saved) {
            console.log('✅ 从 electron storage 加载用户数据:', saved);
            setUserName(saved.name || '婚礼主持人');
            setUserBio(saved.bio || '专业音频工具\n用于婚礼音乐管理和编辑');
            setUserAvatar(saved.avatar || '');
            setUserDataLoaded(true);
            return;
          } else {
            console.log('⚠️  electron storage 中没有找到 userData');
          }
        } else {
          console.log('⚠️  electronAPI.storage 不可用');
        }
      } catch (error) {
        console.warn('❌ 从 electron storage 读取用户数据失败，将尝试使用 localStorage:', error);
      }

      try {
        const savedData = localStorage.getItem('userData');
        if (!cancelled && savedData) {
          const { name, bio, avatar } = JSON.parse(savedData);
          console.log('✅ 从 localStorage 加载用户数据:', { name, bio, avatar });
          setUserName(name || '婚礼主持人');
          setUserBio(bio || '专业音频工具\n用于婚礼音乐管理和编辑');
          setUserAvatar(avatar || '');
        } else {
          console.log('⚠️  localStorage 中没有找到 userData');
        }
      } catch (error) {
        console.warn('❌ 从 localStorage 读取用户数据失败:', error);
      }
      
      setUserDataLoaded(true);
      console.log('✅ 用户数据加载完成');
    };

    loadUserData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save user data when it changes（优先写入 Electron storage，失败时回退到 localStorage）
  // 只有在数据加载完成后才开始保存，避免初始化时覆盖已保存的数据
  useEffect(() => {
    if (!userDataLoaded) {
      console.log('⏸️  用户数据尚未加载完成，跳过保存');
      return; // 数据未加载完成时不保存
    }
    
    const payload = {
      name: userName,
      bio: userBio,
      avatar: userAvatar
    };

    console.log('💾 准备保存用户数据:', payload);

    const saveUserData = async () => {
      try {
        if ((window as any).electronAPI?.storage?.set) {
          const result = await (window as any).electronAPI.storage.set('userData', payload);
          console.log('✅ 用户数据已保存到 electron storage:', payload, 'result:', result);
        } else {
          localStorage.setItem('userData', JSON.stringify(payload));
          console.log('✅ 用户数据已保存到 localStorage:', payload);
        }
      } catch (error) {
        console.warn('❌ 保存用户数据到 electron storage 失败，尝试写入 localStorage:', error);
        try {
          localStorage.setItem('userData', JSON.stringify(payload));
          console.log('✅ 用户数据已保存到 localStorage (fallback):', payload);
        } catch (e) {
          console.error('❌ 保存用户数据到 localStorage 也失败:', e);
        }
      }
    };

    saveUserData();
  }, [userName, userBio, userAvatar, userDataLoaded]);

  // 编辑处理函数
  const handleEditName = (newName: string) => {
    console.log('✏️  handleEditName 被调用，新名字:', newName, '当前 userDataLoaded:', userDataLoaded);
    if (newName && newName.trim() !== userName) {
      console.log('✅ 名字已改变，从', userName, '到', newName);
      setUserName(newName.trim());
    } else {
      console.log('⚠️  名字未改变或为空');
    }
  };

  const handleEditBio = (newBio: string) => {
    console.log('✏️  handleEditBio 被调用，新简介:', newBio);
    setUserBio(newBio);
  };

  // 添加上传函数
  const [showCropModal, setShowCropModal] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({ unit: '%', width: 30, height: 30, x: 25, y: 25 });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleUploadAvatar = async () => {
    try {
      const filePaths = await window.electronAPI.dialog.openFile({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'jpeg'] }]
      });
      
      if (Array.isArray(filePaths) && filePaths.length > 0 && typeof filePaths[0] === 'string') {
        const filePath = filePaths[0];
        const fileData = await window.electronAPI.fs.readFile(filePath);
        const blob = new Blob([new Uint8Array(fileData)], { type: 'image/*' });
        const reader = new FileReader();
        reader.onload = (e) => {
          setImageToCrop(e.target?.result as string);
          setShowCropModal(true);
        };
        reader.readAsDataURL(blob);
      } else {
        console.warn('未选择文件或返回值无效:', filePaths);
      }
    } catch (error) {
      console.error('上传头像失败:', error);
    }
  };

  // Add function to get cropped image
  const getCroppedImg = (imageSrc: string, pixelCrop: PixelCrop) => {
    return new Promise<string>((resolve) => {
      const image = new Image();
      image.src = imageSrc;
      image.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        // Use natural size to avoid blurry crops
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(pixelCrop.width * dpr));
        canvas.height = Math.max(1, Math.round(pixelCrop.height * dpr));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageSrc);
          return;
        }

        // Scale crop from displayed size to natural size
        const scaleX = image.naturalWidth / (imgRef.current?.width || image.width);
        const scaleY = image.naturalHeight / (imgRef.current?.height || image.height);

        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          image,
          Math.round(pixelCrop.x * scaleX),
          Math.round(pixelCrop.y * scaleY),
          Math.round(pixelCrop.width * scaleX),
          Math.round(pixelCrop.height * scaleY),
          0,
          0,
          canvas.width,
          canvas.height
        );
        resolve(canvas.toDataURL('image/png'));
      };
    });
  };

  const handleCropComplete = async () => {
    if (completedCrop && imageToCrop) {
      const croppedImage = await getCroppedImg(imageToCrop, completedCrop);
      setUserAvatar(croppedImage);
      setShowCropModal(false);
      setImageToCrop(null);
    }
  };

  const onImageLoaded = (img: HTMLImageElement) => {
    imgRef.current = img;
    const { width, height } = img;
    try {
      const initial = centerCrop(
        makeAspectCrop({ unit: '%', width: 80 }, 1, width, height),
        width,
        height
      );
      setCrop(initial);
    } catch {
      // Fallback to existing crop if helpers fail
    }
    return false;
  };

  const handleGetMAC = async () => {
    try {
      const mac = await window.electronAPI.getMACAddress();
      if (!mac || !isValidMAC(mac)) {
        toast.error('获取MAC失败: 未找到有效的网卡地址');
        return;
        }
      setMacInput(mac);
      // 移除MAC获取成功提示，减少打扰
      console.log('MAC地址获取成功:', mac);
    } catch (error) {
      toast.error('获取MAC失败: ' + (error as Error).message);
    }
  };

  const copyText = (text: string) => {
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        // 移除复制成功提示，减少打扰
        console.log('已复制到剪贴板:', text);
      })
      .catch(() => toast.error('复制失败'));
  };

  return (
    <div className="App h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 通知系统 */}
      <NotificationSystem 
        notifications={notifications}
        onRemove={removeNotification}
      />
      
      {/* 顶部导航栏 */}
      <TopNavigation
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        isRecording={isGlobalRecording}
        recordingTime={globalRecordingTime}
        onStopRecording={handleGlobalStopRecording}
      />

      {/* 主内容区域 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 侧边栏 */}
        <ImprovedSidebar
          activeView={activeView}
          onViewChange={setActiveView}
          playlists={playlists.map(p => ({
            ...p,
            songCount: p.audioFiles.length,
            isActive: activeView === `playlist-${p.id}`,
            isPlaying: currentPlayingPlaylistId === p.id && currentMusic && isPlaying
          }))}
          onPlaylistSelect={handlePlaylistSelect}
          onSearch={handleSearch}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onCreatePlaylist={() => setShowCreatePlaylistModal(true)}
          onClearLibrary={handleClearLibrary}
          onDeletePlaylist={handleDeletePlaylist}
          onPlaylistReorder={handlePlaylistReorder}
          onImportFilesToPlaylist={handleImportFilesToPlaylist}
          onRenamePlaylist={handleRenamePlaylist}
          userData={{
            name: userName,
            bio: userBio,
            avatar: userAvatar,
          }}
          onUploadAvatar={handleUploadAvatar}
          onEditName={handleEditName}
          onEditBio={handleEditBio}
        />

        {/* 主内容区域 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 可滚动的内容区域 */}
          <div className="flex-1 overflow-auto">
            {renderMainContent()}
          </div>
          
          {/* 播放控制台 */}
          {currentMusic && activeModule === 'music-playback' && (
            <>
              <ImprovedPlayerControl
                currentMusic={currentMusic}
                isPlaying={isPlaying}
                currentTime={currentTime}
                volume={volume}
                isMuted={isMuted}
                isDragging={isDragging}
                isHovering={isHovering}
                dragTime={dragTime}
                onTogglePlayPause={handleTogglePlayPause}
                onStop={handleStop}
                onPrevious={handlePrevious}
                onNext={handleNext}
                onVolumeChange={handleVolumeChange}
                onToggleMute={handleToggleMute}
                onProgressBarClick={handleProgressBarClick}
                onProgressBarMouseDown={handleProgressBarMouseDown}
                onSliderMouseDown={handleSliderMouseDown}
                onProgressBarMouseEnter={() => setIsHovering(true)}
                onProgressBarMouseLeave={() => setIsHovering(false)}
                progressBarRef={progressBarRef}
                playMode={playMode}
                onTogglePlayMode={handleTogglePlayMode}
                // 添加播放歌单信息
                currentPlayingPlaylist={getCurrentPlayingPlaylist()}
              />
            </>
          )}
        </div>
      </div>
      
      {/* 导入文件模态框 */}
      {showImportModal && (
        <ImprovedFileImport
          onImportFiles={handleImportFiles}
          onImportFolder={handleImportFolder}
          onClose={() => setShowImportModal(false)}
        />
      )}
      
      {/* 创建歌单模态框 */}
      <PlaylistCreateModal
        isOpen={showCreatePlaylistModal}
        onClose={() => setShowCreatePlaylistModal(false)}
        onCreate={handleCreatePlaylist}
      />

      <ConsoleRecordingModal
        isOpen={showRecordingModal}
        onClose={() => setShowRecordingModal(false)}
        onStartRecording={handleRecordingStart}
      />

      {/* Activation Modal */}
      {!isActivated && (
        <Transition appear show={!isActivated} as={Fragment}>
          <Dialog as="div" className="fixed inset-0 z-50 overflow-y-auto" onClose={() => {}} static>
            <div className="min-h-screen px-4 text-center bg-gradient-to-r from-blue-100 to-blue-200"> {/* Beautiful background */}
              <Transition.Child
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="inline-block w-full max-w-lg p-8 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-2xl rounded-2xl" style={{}}>
                  {/* Custom draggable title bar */}
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 flex items-center justify-between px-4 text-gray-800 dark:text-gray-200 font-semibold cursor-move select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                    <span>婚礼音乐播放器激活</span>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-xs">{isOnline ? '在线' : '离线'}</span>
                    </div>
                  </div>
                  <div className="mt-6" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    {/* Step indicators */}
                    <div className="flex justify-around mb-6 mt-4">
                      <div className={`step ${step >= 1 ? 'active' : ''}`}>步骤1: 获取MAC</div>
                      <div className={`step ${step >= 2 ? 'active' : ''}`}>步骤2: 生成码</div>
                      <div className={`step ${step >= 3 ? 'active' : ''}`}>步骤3: 激活</div>
                    </div>

                    {step === 1 && (
                      <div className="p-4 bg-white rounded-lg shadow-md">
                        <p className="text-gray-800 mb-4 font-bold">步骤1: 获取您的 MAC 地址</p>
                        <div className="space-y-4 text-sm text-gray-700">
                          <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">macOS</span>
                              <button className="text-blue-600 hover:underline" onClick={() => copyText("ifconfig en0 | grep ether | awk '{print $2}'")}>复制命令</button>
                            </div>
                            <pre className="text-xs bg-white p-2 rounded border border-gray-200 overflow-auto">{`ifconfig en0 | grep ether | awk '{print $2}'`}</pre>
                            <p className="text-xs text-gray-500 mt-1">若无结果，尝试 <code>en1</code> 或执行：<br/><code>{`networksetup -listallhardwareports | awk '/Device|Ethernet Address/{print $NF}'`}</code></p>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">Windows</span>
                              <button className="text-blue-600 hover:underline" onClick={() => copyText('getmac')}>复制命令</button>
                            </div>
                            <pre className="text-xs bg-white p-2 rounded border border-gray-200 overflow-auto">getmac</pre>
                            <p className="text-xs text-gray-500 mt-1">或使用：wmic nic where (NetEnabled=true) get MACAddress</p>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">Linux</span>
                              <button className="text-blue-600 hover:underline" onClick={() => copyText("ip link | grep ether | awk '{print $2}'")}>复制命令</button>
                            </div>
                            <pre className="text-xs bg-white p-2 rounded border border-gray-200 overflow-auto">{`ip link | grep ether | awk '{print $2}'`}</pre>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">我的MAC地址</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={macInput}
                                onChange={(e) => setMacInput(e.target.value)}
                                placeholder="XX:XX:XX:XX:XX:XX"
                                className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                              <button onClick={handleGetMAC} className="px-3 rounded-lg bg-green-600 text-white hover:bg-green-700">自动获取</button>
                              <button onClick={() => copyText(macInput)} disabled={!macInput} className="px-3 rounded-lg bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50">复制</button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">获取后，将 MAC 地址发送给卖家生成激活码。</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setStep(2)}
                          className="w-full mt-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          下一步
                        </button>
                      </div>
                    )}

                    {step === 2 && (
                      <div className="p-4 bg-white rounded-lg shadow-md">
                        <p className="text-gray-600 mb-4">使用独立密钥生成器生成您的激活码：</p>
                        <p className="text-sm text-gray-500 mb-4">1. 打开密钥生成器应用。<br/>2. 输入MAC地址和到期时间。<br/>3. 生成密钥并复制。</p>
                        <div className="flex justify-between mt-4">
                          <button onClick={() => setStep(1)} className="py-2 px-4 bg-gray-300 rounded-lg hover:bg-gray-400">上一步</button>
                          <button onClick={() => setStep(3)} className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700">我有密钥，下一步</button>
                        </div>
                      </div>
                    )}

                    {step === 3 && (
                      <div className="p-4 bg-white rounded-lg shadow-md">
                        <p className="text-gray-600 mb-4 font-bold">步骤3: 输入激活码与手动获取的MAC地址</p>
                        <p className="text-gray-500 mb-2 text-sm">使用独立密钥生成器（卖家设置到期时间）生成激活码。</p>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">MAC地址</label>
                          <input
                            type="text"
                            value={macInput}
                            onChange={(e) => setMacInput(e.target.value)}
                            placeholder="XX:XX:XX:XX:XX:XX"
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 cursor-text select-text"
                          />
                        </div>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">激活码</label>
                          <input
                            type="text"
                            value={activationCode}
                            onChange={(e) => setActivationCode(e.target.value)}
                            placeholder="粘贴卖家提供的激活码"
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 cursor-text select-text"
                          />
                        </div>
                        <button
                          onClick={handleActivate}
                          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          disabled={isActivating}
                        >
                          {isActivating ? '激活中...' : '立即激活'}
                        </button>
                        <button
                          onClick={() => setStep(2)}
                          className="w-full mt-2 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                        >
                          上一步
                        </button>
                      </div>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition>
      )}
      <ToastContainer position="top-right" autoClose={3000} />
      {showCropModal && imageToCrop && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[90vw] p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-3">调整头像</h3>
            <div className="max-h-[60vh] overflow-auto">
              <ReactCrop
                crop={crop}
                onChange={(nextCrop) => setCrop(nextCrop)}
                onComplete={(next) => setCompletedCrop(next as PixelCrop)}
                aspect={1}
                minWidth={40}
                minHeight={40}
                keepSelection
              >
                <img
                  src={imageToCrop}
                  alt="选择裁剪区域"
                  onLoad={(e) => onImageLoaded(e.currentTarget)}
                  style={{ maxWidth: '100%', maxHeight: '50vh', display: 'block', margin: '0 auto' }}
                />
              </ReactCrop>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCropModal(false)}
                className="px-3 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                取消
              </button>
              <button
                onClick={handleCropComplete}
                disabled={!completedCrop || !imageToCrop}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700"
              >
                保存头像
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImprovedApp;

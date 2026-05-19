import React, { useState } from 'react';
import {
  PlaylistIcon,
  MusicNoteIcon,
  HeartIcon,
  ClockIcon,
  SearchIcon,
  GridIcon,
  ListIcon,
  PlusIcon,
  FolderIcon,
  DeleteIcon,
  MoreIcon
} from './icons/AudioIcons';

interface UserData {
  name: string;
  bio: string; // 替换 company
  avatar: string;
}

interface ImprovedSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  playlists: any[];
  onPlaylistSelect: (playlistId: string) => void;
  onSearch: (query: string) => void;
  viewMode: 'list' | 'grid';
  onViewModeChange: (mode: 'list' | 'grid') => void;
  onCreatePlaylist: () => void;
  onClearLibrary: () => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRenamePlaylist?: (playlistId: string, newName: string) => void;
  onPlaylistReorder?: (fromIndex: number, toIndex: number) => void;
  onImportFilesToPlaylist?: (files: File[], playlistId: string) => void;
  userData?: UserData;
  onUploadAvatar?: () => void;
  onEditName?: (name: string) => void;
  onEditBio?: (bio: string) => void;
  /**
   * 是否隐藏顶部用户信息区域（头像、姓名、简介）。
   * 在田字格布局中，头像会被提取到独立组件显示，此时可设置为 true。
   */
  hideUserSection?: boolean;
}

export const ImprovedSidebar: React.FC<ImprovedSidebarProps> = ({
  activeView,
  onViewChange,
  playlists,
  onPlaylistSelect,
  onSearch,
  viewMode,
  onViewModeChange,
  onCreatePlaylist,
  onClearLibrary,
  onDeletePlaylist,
  onRenamePlaylist,
  onPlaylistReorder,
  onImportFilesToPlaylist,
  userData,
  onUploadAvatar,
  onEditName,
  onEditBio,
  hideUserSection = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);
  const [isDragOverWithFiles, setIsDragOverWithFiles] = useState<string | null>(null);
  
  // 重命名对话框状态
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renamePlaylistId, setRenamePlaylistId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    onSearch(query);
  };

  // 打开重命名对话框
  const openRenameDialog = (playlistId: string, currentName: string) => {
    console.log('🔘 打开重命名对话框，歌单:', currentName);
    setRenamePlaylistId(playlistId);
    setRenameValue(currentName);
    setShowRenameDialog(true);
  };

  // 确认重命名
  const handleConfirmRename = () => {
    if (renamePlaylistId && renameValue.trim() && onRenamePlaylist) {
      console.log('✅ 确认重命名:', renamePlaylistId, renameValue.trim());
      onRenamePlaylist(renamePlaylistId, renameValue.trim());
    }
    setShowRenameDialog(false);
    setRenamePlaylistId(null);
    setRenameValue('');
  };

  // 取消重命名
  const handleCancelRename = () => {
    console.log('⚠️  取消重命名');
    setShowRenameDialog(false);
    setRenamePlaylistId(null);
    setRenameValue('');
  };

  // 拖拽处理函数
  const handleDragStart = (e: React.DragEvent, playlistId: string, index: number) => {
    setDraggedItem(playlistId);
    e.dataTransfer.setData('text/plain', playlistId);
    e.dataTransfer.effectAllowed = 'move';
    
    // 添加拖拽样式
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedItem(null);
    setDraggedOverIndex(null);
    
    // 恢复样式
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number, playlistId?: string) => {
    e.preventDefault();
    
    // 检查是否是拖拽文件
    const hasFiles = e.dataTransfer.types.includes('Files');
    if (hasFiles && playlistId) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOverWithFiles(playlistId);
    } else {
      e.dataTransfer.dropEffect = 'move';
      setDraggedOverIndex(index);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // 只有当离开整个组件时才清除高亮
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDraggedOverIndex(null);
      setIsDragOverWithFiles(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number, playlistId?: string) => {
    e.preventDefault();
    
    // 检查是否是拖拽的文件
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && playlistId && onImportFilesToPlaylist) {
      // 过滤音频文件
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
      
      if (audioFiles.length > 0) {
        console.log(`拖拽 ${audioFiles.length} 个音频文件到播放列表 ${playlistId}`);
        onImportFilesToPlaylist(audioFiles, playlistId);
        setDraggedItem(null);
        setDraggedOverIndex(null);
        setIsDragOverWithFiles(null);
        return;
      }
    }
    
    // 检查是否是拖拽的播放列表重排序
    const draggedPlaylistId = e.dataTransfer.getData('text/plain');
    if (draggedPlaylistId && onPlaylistReorder) {
      const draggedIndex = playlists.findIndex(p => p.id === draggedPlaylistId);
      if (draggedIndex !== -1 && draggedIndex !== targetIndex) {
        onPlaylistReorder(draggedIndex, targetIndex);
      }
    }
    
    setDraggedItem(null);
    setDraggedOverIndex(null);
    setIsDragOverWithFiles(null);
  };

  // 移除默认导航菜单项
  const menuItems: any[] = [];

  return (
    <div className={`flex flex-col transition-all duration-300 ${
      isCollapsed ? 'w-20' : 'w-72'
    } border-r border-gray-200 dark:border-slate-700 shadow-xl bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-800 text-gray-900 dark:text-white`}>
      {/* 折叠按钮 */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute right-0 top-20 bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-l-lg shadow-lg z-10 transition-all"
        title={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        <svg
          className={`w-4 h-4 transform transition-transform ${isCollapsed ? 'rotate-0' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* 用户信息区域 */}
      {userData && !isCollapsed && !hideUserSection && (
        <div className="px-6 pt-4 pb-6 border-b border-gray-200 dark:border-slate-700 flex flex-col items-center space-y-3" style={{ ['WebkitAppRegion' as any]: 'no-drag' }}>
          {/* 大头像 */}
          <div className="relative group">
            <div className="w-28 h-28 rounded-lg overflow-hidden shadow-lg bg-gray-100 flex items-center justify-center">
              {userData.avatar ? (
                <img src={userData.avatar} alt={userData.name} className="w-full h-full object-cover" />
              ) : (
                <div className="text-4xl text-blue-500 font-bold uppercase">
                  {userData.name?.charAt(0) || 'U'}
                </div>
              )}
            </div>
            {/* 上传按钮 */}
            <button
              onClick={onUploadAvatar}
              className="absolute bottom-1 right-1 p-1 bg-blue-600 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              title="上传头像"
            >
              +
            </button>
          </div>
          {/* 姓名 */}
          <input
            type="text"
            key={userData.name}
            defaultValue={userData.name}
            onBlur={(e)=> {
              console.log('👤 用户名输入框失焦，当前值:', e.target.value, '原值:', userData.name);
              if (onEditName) {
                onEditName(e.target.value);
              } else {
                console.error('❌ onEditName 未定义');
              }
            }}
            className="w-full text-center font-medium text-lg bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none"
            placeholder="输入姓名"
          />
        </div>
      )}

      {/* 搜索栏 */}
      <div className={`p-4 border-b border-gray-200 dark:border-slate-700 ${isCollapsed ? 'hidden' : ''}`}>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="搜索音乐、歌手或专辑..."
            className="w-full bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-gray-200 dark:focus:bg-slate-700 transition-all placeholder-gray-500 dark:placeholder-slate-400"
          />
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        </div>
      </div>

      {/* 视图切换 */}
      <div className={`px-4 py-3 border-b border-gray-200 dark:border-slate-700 ${isCollapsed ? 'hidden' : ''}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 uppercase tracking-wider">视图模式</span>
          <div className="flex items-center space-x-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => onViewModeChange('list')}
              className={`p-1 rounded transition-all ${
                viewMode === 'list' 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
              title="列表视图"
            >
              <ListIcon className="w-3 h-3" />
            </button>
            <button
              onClick={() => onViewModeChange('grid')}
              className={`p-1 rounded transition-all ${
                viewMode === 'grid' 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
              title="网格视图"
            >
              <GridIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 导航菜单 */}
      <div className="flex-1 overflow-y-auto">
        {/* 主要导航 */}
        <div className={`py-2 ${isCollapsed ? 'px-2' : 'px-4'}`}>
          <nav className="space-y-1">
            {/* 全部音乐 */}
            <button
              onClick={() => onViewChange('all-music')}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-all ${
                activeView === 'all-music'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title="全部音乐"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              {!isCollapsed && <span>全部音乐</span>}
            </button>
          </nav>
        </div>
       

        {/* 播放列表区域 */}
        <div className={`py-4 border-t border-gray-200 dark:border-slate-700 ${isCollapsed ? 'hidden' : ''}`}>
          <div className="px-4 mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs text-slate-400 uppercase tracking-wider">播放列表</h3>
              {playlists.length > 1 && (
                <span className="text-xs text-slate-500 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full" title="拖拽歌单可重新排序">
                  可拖拽
                </span>
              )}
            </div>
            <button
              onClick={onCreatePlaylist}
              className="text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700"
              title="创建播放列表"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-1 px-4 max-h-64 overflow-y-auto">
            {playlists.length === 0 ? (
              <div className="text-center py-8">
                <PlaylistIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-slate-400">暂无播放列表</p>
                <button
                  onClick={onCreatePlaylist}
                  className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  创建第一个播放列表
                </button>
              </div>
            ) : (
              playlists.map((playlist, index) => (
                <div
                  key={playlist.id}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, playlist.id, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index, playlist.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index, playlist.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all group relative cursor-move ${
                    playlist.isActive
                      ? 'bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700/50'
                  } ${
                    playlist.isPlaying
                      ? 'ring-2 ring-green-500 dark:ring-green-400 shadow-md'
                      : ''
                  } ${
                    draggedItem === playlist.id
                      ? 'opacity-50 scale-95'
                      : ''
                  } ${
                    draggedOverIndex === index && draggedItem !== playlist.id
                      ? 'border-t-2 border-blue-500'
                      : ''
                  } ${
                    isDragOverWithFiles === playlist.id
                      ? 'bg-green-100 dark:bg-green-900/30 ring-2 ring-green-400 dark:ring-green-500 ring-dashed'
                      : ''
                  }`}
                >
                  {/* 播放状态指示器 */}
                  {playlist.isPlaying && (
                    <div className="absolute -left-1 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-green-500 dark:bg-green-400 rounded-full"></div>
                  )}
                  <div
                    className="flex-1 flex items-center space-x-3 min-w-0 text-left cursor-pointer"
                    onClick={(e) => {
                      // 只有单击才选择歌单
                      if (e.detail === 1) {
                        onPlaylistSelect(playlist.id);
                      }
                    }}
                    onDoubleClick={(e) => {
                      // 双击重命名
                      e.stopPropagation();
                      e.preventDefault();
                      console.log('🔘 双击歌单，歌单:', playlist.name);
                      openRenameDialog(playlist.id, playlist.name);
                    }}
                  >
                    <div 
                      className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${
                        playlist.coverColor || 'bg-gradient-to-br from-purple-500 to-pink-500'
                      }`}
                    >
                      {playlist.coverIcon ? (
                        <span className="text-white text-xs">{playlist.coverIcon}</span>
                      ) : (
                        <PlaylistIcon className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div 
                        className="text-sm font-medium truncate flex items-center gap-2"
                        title="双击可重命名歌单"
                      >
                        {playlist.name}
                        {playlist.isPlaying && (
                          <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                            正在播放
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {playlist.songCount || 0} 首歌曲
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* 重命名按钮 - 始终显示 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('🔘 点击重命名按钮，歌单:', playlist.name);
                        openRenameDialog(playlist.id, playlist.name);
                      }}
                      className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                      title="重命名歌单"
                      type="button"
                    >
                      <MoreIcon className="w-4 h-4" />
                    </button>

                    {/* 删除按钮（默认歌单不可删除） */}
                    {!playlist.isDefault && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (confirm(`确定删除歌单"${playlist.name}"吗？`)) {
                            onDeletePlaylist(playlist.id);
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="删除歌单"
                      >
                        <DeleteIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 重命名对话框 */}
      {showRenameDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCancelRename}>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">重命名歌单</h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmRename();
                } else if (e.key === 'Escape') {
                  handleCancelRename();
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              placeholder="输入新的歌单名称"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={handleCancelRename}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmRename}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
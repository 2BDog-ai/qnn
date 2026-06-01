import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult, DragUpdate } from '@hello-pangea/dnd';

// 鍓緫鍥炬爣缁勪欢 - 浣跨敤鍓垁鍥炬爣
const TrimmedIcon = ({ className, title }: { className?: string; title?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {title && <title>{title}</title>}
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
  </svg>
);

const buildAudioEditorHash = (musicId: string, playlistId?: string) => {
  const base = `#/audio-editor/${encodeURIComponent(musicId)}`;
  return playlistId ? `${base}?playlistId=${encodeURIComponent(playlistId)}` : base;
};

import {
  PlayIcon,
  PauseIcon,
  HeartIcon,
  MoreIcon,
  TimeIcon,
  MusicNoteIcon,
  DownloadIcon,
  ShareIcon,
  DeleteIcon,
  EditIcon,
  PlusIcon
} from './icons/AudioIcons';

interface MusicFile {
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
}

interface ImprovedMusicListProps {
  musicFiles: MusicFile[];
  currentMusic: MusicFile | null;
  isPlaying: boolean;
  viewMode: 'list' | 'grid';
  onPlayMusic: (music: MusicFile, options?: { restartSame?: boolean }) => void;
  onToggleFavorite: (musicId: string) => void;
  onDeleteMusic: (musicId: string) => void;
  onRenameMusic: (musicId: string, newName: string) => void;
  onAddToPlaylist?: (musicId: string, playlistId: string) => void;
  onRemoveFromPlaylist?: (musicId: string, playlistId: string) => void;
  playlists?: any[];
  currentPlaylistId?: string;
  onReorder?: (ids: string[]) => void | Promise<void>;
  highlightedId?: string | null;
  onImportFiles?: (files: File[]) => void;
  // 鎵嬪姩鎺掑簭鐩稿叧锛堥儴鍒嗚皟鐢ㄦ柟浼氫紶鍏ワ級
  isManualSortMode?: boolean;
  onStartManualSort?: () => void;
  onFinishManualSort?: () => void;
  onCancelManualSort?: () => void;
}

export const ImprovedMusicList: React.FC<ImprovedMusicListProps> = ({
  musicFiles,
  currentMusic,
  isPlaying,
  viewMode,
  onPlayMusic,
  onToggleFavorite,
  onDeleteMusic,
  onRenameMusic,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  playlists = [],
  currentPlaylistId,
  onReorder,
  highlightedId,
  onImportFiles,
  // 鎵嬪姩鎺掑簭鐩稿叧props
  isManualSortMode = false,
  onStartManualSort,
  onFinishManualSort,
  onCancelManualSort
}) => {

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);
  const [selectedMusicForPlaylist, setSelectedMusicForPlaylist] = useState<MusicFile | null>(null);
  const [listDragTargetIndex, setListDragTargetIndex] = useState<number | null>(null);

  // 璋冭瘯锛氱洃鍚琧ontextMenuId鍙樺寲
  React.useEffect(() => {
    console.log('contextMenuId 鐘舵€佸彉鍖?', contextMenuId);
  }, [contextMenuId]);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragInsertIndexRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggeredRef = useRef(false);
  const isSortingDragRef = useRef(false);
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const activeScrollTargetRef = useRef<HTMLElement | null>(null);
  const listDragSourceIdRef = useRef<string | null>(null);
  const listRawInsertIndexRef = useRef<number | null>(null);
  const gridDragSourceIndexRef = useRef<number | null>(null);
  const gridDragSourceIdRef = useRef<string | null>(null);
  const [gridDraggingId, setGridDraggingId] = useState<string | null>(null);
  const [gridInsertIndex, setGridInsertIndex] = useState<number | null>(null);

  const findScrollableParent = (element: Element | null): HTMLElement | null => {
    let current = element instanceof HTMLElement ? element : element?.parentElement || null;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const canScrollY = /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight;
      if (canScrollY) return current;
      current = current.parentElement;
    }
    return null;
  };

  const getFallbackScrollElement = (): HTMLElement | null => {
    const listContainer = document.getElementById('music-scroll-container');
    if (listContainer instanceof HTMLElement && listContainer.scrollHeight > listContainer.clientHeight) {
      return listContainer;
    }
    const scrollingElement = document.scrollingElement;
    return scrollingElement instanceof HTMLElement ? scrollingElement : document.documentElement;
  };

  const setListDragTarget = (index: number | null, rawInsertIndex?: number | null) => {
    if (rawInsertIndex !== undefined) {
      listRawInsertIndexRef.current = rawInsertIndex;
    }
    setListDragTargetIndex((current) => (current === index ? current : index));
  };

  const getListInsertionIndex = (clientY: number) => {
    const container = document.getElementById('music-scroll-container');
    if (!container) return musicFiles.length;

    const sourceId = listDragSourceIdRef.current;
    const nodes = Array.from(
      container.querySelectorAll<HTMLElement>('[data-list-sort-item="true"]')
    );

    const items = nodes
      .map((node) => ({
        id: node.dataset.listId || '',
        index: Number(node.dataset.listIndex),
        rect: node.getBoundingClientRect()
      }))
      .filter((item) => Number.isFinite(item.index) && item.id !== sourceId)
      .sort((a, b) => a.index - b.index);

    if (items.length === 0) return 0;

    for (const item of items) {
      if (clientY < item.rect.top + item.rect.height / 2) {
        return item.index;
      }
    }

    return musicFiles.length;
  };

  const runAutoScroll = () => {
    if (!isSortingDragRef.current) {
      autoScrollFrameRef.current = null;
      return;
    }

    const pointer = dragPointerRef.current;
    if (pointer) {
      const hovered = document.elementFromPoint(pointer.x, pointer.y);
      const scrollTarget = activeScrollTargetRef.current || findScrollableParent(hovered) || getFallbackScrollElement();

      if (scrollTarget) {
        const isDocumentScroller = scrollTarget === document.documentElement || scrollTarget === document.body;
        const rect = isDocumentScroller
          ? { top: 0, bottom: window.innerHeight }
          : scrollTarget.getBoundingClientRect();
        const edgeSize = Math.min(150, Math.max(110, (rect.bottom - rect.top) * 0.18));
        const maxSpeed = 7;
        let deltaY = 0;

        if (pointer.y < rect.top + edgeSize) {
          const distance = Math.max(0, pointer.y - rect.top);
          deltaY = -Math.max(1, Math.ceil(((edgeSize - distance) / edgeSize) * maxSpeed));
        } else if (pointer.y > rect.bottom - edgeSize) {
          const distance = Math.max(0, rect.bottom - pointer.y);
          deltaY = Math.max(1, Math.ceil(((edgeSize - distance) / edgeSize) * maxSpeed));
        }

        if (deltaY !== 0) {
          if (isDocumentScroller) {
            window.scrollBy({ top: deltaY, behavior: 'auto' });
          } else {
            const maxScrollTop = scrollTarget.scrollHeight - scrollTarget.clientHeight;
            const nextScrollTop = Math.max(0, Math.min(maxScrollTop, scrollTarget.scrollTop + deltaY));
            scrollTarget.scrollTop = nextScrollTop;
          }
        }
      }

      if (listDragSourceIdRef.current) {
        const rawInsertIndex = getListInsertionIndex(pointer.y);
        setListDragTarget(rawInsertIndex, rawInsertIndex);
      } else if (gridDragSourceIdRef.current) {
        setGridInsertTargetIndex(getGridInsertionIndex(pointer.x, pointer.y));
      }
    }

    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
  };

  const startSortingAutoScroll = (draggableId?: string) => {
    isSortingDragRef.current = true;
    const sourceElement = draggableId ? document.getElementById(`music-item-${draggableId}`) : null;
    activeScrollTargetRef.current = findScrollableParent(sourceElement);
    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
    }
  };

  const stopSortingAutoScroll = () => {
    isSortingDragRef.current = false;
    dragPointerRef.current = null;
    activeScrollTargetRef.current = null;
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  };

  const setGridInsertTargetIndex = (index: number | null) => {
    dragInsertIndexRef.current = index;
    setGridInsertIndex((current) => (current === index ? current : index));
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isSortingDragRef.current) return;
      dragPointerRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isSortingDragRef.current || event.touches.length === 0) return;
      const touch = event.touches[0];
      dragPointerRef.current = { x: touch.clientX, y: touch.clientY };
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchmove', handleTouchMove);
      stopSortingAutoScroll();
    };
  }, []);

  // 鑷姩婊氬姩鍒板綋鍓嶆挱鏀剧殑姝屾洸
  useEffect(() => {
    if (currentMusic && isPlaying) {
      const el = document.getElementById(`music-item-${currentMusic.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentMusic?.id, isPlaying]);

  // 闀挎寜杩涘叆鎺掑簭妯″紡
  const handleLongPressStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (isManualSortMode) return;
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      if (onStartManualSort) {
        onStartManualSort();
      }
    }, 600);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleLongPressMove = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };


  const sortedMusicFiles = useMemo(() => {
    return musicFiles;
  }, [musicFiles]);

  const handleDragEnd = (result: DropResult) => {
    const rawInsertIndex = listRawInsertIndexRef.current;
    const destinationIndex = rawInsertIndex ?? result.destination?.index ?? null;

    setListDragTarget(null, null);
    listDragSourceIdRef.current = null;

    if (destinationIndex === null) return;

    const reordered = Array.from(sortedMusicFiles);
    const [removed] = reordered.splice(result.source.index, 1);
    let insertIndex = destinationIndex;
    if (rawInsertIndex !== null && insertIndex > result.source.index) {
      insertIndex -= 1;
    }
    insertIndex = Math.max(0, Math.min(insertIndex, reordered.length));

    if (insertIndex === result.source.index) return;

    reordered.splice(insertIndex, 0, removed);
    if (onReorder) void onReorder(reordered.map(m => m.id));
  };

  const handleDragUpdate = (update: DragUpdate) => {
    if (update.destination) {
      setListDragTarget(update.destination.index);
    } else if (dragPointerRef.current && listDragSourceIdRef.current) {
      const rawInsertIndex = getListInsertionIndex(dragPointerRef.current.y);
      setListDragTarget(rawInsertIndex, rawInsertIndex);
    } else {
      setListDragTarget(null);
    }
  };

  const cleanupGridDrag = () => {
    document.body.style.userSelect = '';
    stopSortingAutoScroll();
    gridDragSourceIndexRef.current = null;
    gridDragSourceIdRef.current = null;
    setGridDraggingId(null);
    setGridInsertTargetIndex(null);
  };

  const commitGridReorder = () => {
    const sourceId = gridDragSourceIdRef.current;
    const fallbackSourceIndex = gridDragSourceIndexRef.current;
    const sourceIndex = sourceId
      ? sortedMusicFiles.findIndex((music) => music.id === sourceId)
      : fallbackSourceIndex;
    const rawDestinationIndex = dragInsertIndexRef.current;

    if (sourceIndex === null || sourceIndex < 0 || rawDestinationIndex === null) {
      return;
    }

    const reordered = Array.from(sortedMusicFiles);
    const [removed] = reordered.splice(sourceIndex, 1);
    let destinationIndex = rawDestinationIndex;
    if (destinationIndex > sourceIndex) destinationIndex -= 1;
    destinationIndex = Math.max(0, Math.min(destinationIndex, reordered.length));

    if (removed && destinationIndex !== sourceIndex) {
      reordered.splice(destinationIndex, 0, removed);
      if (onReorder) void onReorder(reordered.map(m => m.id));
    }
  };

  const handleGridDragStart = (event: React.DragEvent<HTMLDivElement>, music: MusicFile, index: number) => {
    event.stopPropagation();
    if (!isManualSortMode && onStartManualSort) {
      onStartManualSort();
    }
    gridDragSourceIndexRef.current = index;
    gridDragSourceIdRef.current = music.id;
    setGridDraggingId(music.id);
    setGridInsertTargetIndex(index);
    dragPointerRef.current = { x: event.clientX, y: event.clientY };
    document.body.style.userSelect = 'none';
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-wedding-music-id', music.id);
    event.dataTransfer.setData('text/plain', music.id);
    startSortingAutoScroll(music.id);
  };

  const getGridInsertionIndex = (clientX: number, clientY: number) => {
    const container = document.getElementById('music-grid-container');
    if (!container) return sortedMusicFiles.length;

    const nodes = Array.from(
      container.querySelectorAll<HTMLElement>('[data-grid-sort-item="true"]')
    );
    if (nodes.length === 0) return sortedMusicFiles.length;

    const items = nodes
      .map((node) => ({
        index: Number(node.dataset.gridIndex),
        id: node.dataset.gridId || '',
        rect: node.getBoundingClientRect()
      }))
      .filter((item) => Number.isFinite(item.index) && item.id !== gridDragSourceIdRef.current)
      .sort((a, b) => a.index - b.index);

    if (items.length === 0) return 0;

    const rows: Array<{
      top: number;
      bottom: number;
      items: typeof items;
    }> = [];

    items.forEach((item) => {
      const lastRow = rows[rows.length - 1];
      const rowTolerance = Math.max(8, item.rect.height * 0.35);
      if (!lastRow || Math.abs(item.rect.top - lastRow.top) > rowTolerance) {
        rows.push({
          top: item.rect.top,
          bottom: item.rect.bottom,
          items: [item]
        });
      } else {
        lastRow.top = Math.min(lastRow.top, item.rect.top);
        lastRow.bottom = Math.max(lastRow.bottom, item.rect.bottom);
        lastRow.items.push(item);
      }
    });

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const rowItems = [...row.items].sort((a, b) => a.rect.left - b.rect.left);
      const nextRow = rows[rowIndex + 1];

      if (clientY < row.top) {
        return rowItems[0]?.index ?? 0;
      }

      if (clientY <= row.bottom) {
        for (const item of rowItems) {
          if (clientX < item.rect.left + item.rect.width / 2) {
            return item.index;
          }
        }
        return (rowItems[rowItems.length - 1]?.index ?? sortedMusicFiles.length - 1) + 1;
      }

      if (nextRow && clientY < nextRow.top) {
        const gapMiddle = row.bottom + (nextRow.top - row.bottom) / 2;
        if (clientY < gapMiddle) {
          return (rowItems[rowItems.length - 1]?.index ?? sortedMusicFiles.length - 1) + 1;
        }
        const nextItems = [...nextRow.items].sort((a, b) => a.rect.left - b.rect.left);
        return nextItems[0]?.index ?? sortedMusicFiles.length;
      }
    }

    return sortedMusicFiles.length;
  };

  const hasActiveGridDrag = () => gridDragSourceIdRef.current !== null;

  const handleGridItemDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!hasActiveGridDrag()) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    dragPointerRef.current = { x: event.clientX, y: event.clientY };
    setGridInsertTargetIndex(getGridInsertionIndex(event.clientX, event.clientY));
  };

  const handleGridDrag = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasActiveGridDrag() || event.clientX === 0 && event.clientY === 0) return;
    dragPointerRef.current = { x: event.clientX, y: event.clientY };
    setGridInsertTargetIndex(getGridInsertionIndex(event.clientX, event.clientY));
  };

  const handleGridContainerDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasActiveGridDrag()) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    dragPointerRef.current = { x: event.clientX, y: event.clientY };
    setGridInsertTargetIndex(getGridInsertionIndex(event.clientX, event.clientY));
  };

  const handleGridDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasActiveGridDrag()) return;
    event.preventDefault();
    event.stopPropagation();
    commitGridReorder();
    cleanupGridDrag();
  };

  const handleGridDragEnd = () => {
    if (hasActiveGridDrag()) {
      commitGridReorder();
    }
    cleanupGridDrag();
  };

  const isFileDragEvent = (event: React.DragEvent) => {
    return Array.from(event.dataTransfer.types || []).includes('Files');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)} MB`;
  };


  const handleSelect = (id: string, event: React.MouseEvent) => {
    if (event.shiftKey) {
      // 澶氶€夐€昏緫
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      setSelectedIds(newSet);
    } else {
      setSelectedIds(new Set([id]));
    }
  };

  const handleStartEdit = (music: MusicFile) => {
    setEditingId(music.id);
    setEditingName(music.name);
  };

  const handleSaveEdit = () => {
    if (editingId && editingName.trim()) {
      onRenameMusic(editingId, editingName.trim());
      setEditingId(null);
      setEditingName('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  // 鎷栨嫿鏂囦欢瀵煎叆澶勭悊鍑芥暟
  const handleDragOver = (e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    // 鍙湁褰撶湡姝ｇ寮€瀹瑰櫒鏃舵墠璁剧疆涓篺alse
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    
    if (files.length === 0) {
      return;
    }

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

    if (audioFiles.length > 0 && onImportFiles) {
      console.log(`Ready to import ${audioFiles.length} audio files`);
      onImportFiles(audioFiles);
    } else if (files.length > 0 && audioFiles.length === 0) {
      console.warn(`Dropped ${files.length} files, but none were supported audio files`);
      // 杩欓噷鍙互鏄剧ず涓€涓彁绀猴紝浣嗘垜浠涓诲簲鐢ㄧ粍浠跺鐞嗛€氱煡
    }
  };

  if (viewMode === 'grid') {
    return (
      <div 
        className="p-6 relative"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 鎷栨嫿瑕嗙洊灞?*/}
        {isDragOver && (
          <div className="absolute inset-0 bg-blue-500/20 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center z-50">
            <div className="bg-white/90 backdrop-blur-sm px-6 py-4 rounded-lg shadow-lg">
              <div className="text-center">
                <div className="text-3xl mb-2">♪</div>
                <div className="text-lg font-semibold text-blue-700">拖放音乐文件到此处</div>
                <div className="text-sm text-gray-600 mt-1">支持 MP3, WAV, FLAC, M4A 等格式</div>
              </div>
            </div>
          </div>
        )}
        
        {/* 宸ュ叿鏍?*/}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              共 {musicFiles.length} 首歌曲
            </span>
            {selectedIds.size > 0 && (
              <span className="text-sm text-blue-600">
                已选中 {selectedIds.size} 项
              </span>
            )}
          </div>
        </div>

        {/* 缃戞牸瑙嗗浘 */}
        {musicFiles.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">♪</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">还没有音乐文件</h3>
            <p className="text-gray-500 mb-6">
              点击"导入音乐"按钮，或将音乐文件拖拽到此处开始使用
            </p>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 bg-gray-50/50">
              <p className="text-sm text-gray-600">
                支持的音频格式：MP3, WAV, FLAC, M4A, AAC, OGG, WMA, OPUS
              </p>
            </div>
          </div>
        ) : (
          <div
            id="music-grid-container"
            className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3 relative"
            onDragOver={handleGridContainerDragOver}
            onDrop={handleGridDrop}
          >
            {sortedMusicFiles.map((music, index) => (
              <React.Fragment key={music.id}>
                {gridDraggingId && gridInsertIndex === index && (
                  <div className="rounded-xl border-2 border-dashed border-blue-500 bg-blue-50/70 min-h-[118px]" />
                )}
                <div className="relative">
                        <div
                          id={`music-item-${music.id}`}
                          draggable
                          onDragStart={(event) => handleGridDragStart(event, music, index)}
                          onDrag={handleGridDrag}
                          data-grid-sort-item="true"
                          data-grid-index={index}
                          data-grid-id={music.id}
                          onDragOver={handleGridItemDragOver}
                          onDragEnter={handleGridItemDragOver}
                          onDrop={handleGridDrop}
                          onDragEnd={handleGridDragEnd}
                          className={`group relative rounded-xl cursor-grab active:cursor-grabbing ${
                            selectedIds.has(music.id) ? 'ring-2 ring-blue-500' : ''
                          } ${
                            music.isPlaying && isPlaying 
                              ? 'bg-gradient-to-br from-green-50 to-emerald-50 ring-4 ring-green-400 shadow-2xl shadow-green-300/60 transform hover:scale-105' 
                              : currentMusic?.id === music.id 
                                ? 'bg-gradient-to-br from-purple-50 to-blue-50 ring-2 ring-purple-500' 
                                : 'bg-white'
                          } ${
                            highlightedId === music.id 
                              ? 'ring-2 ring-yellow-400 bg-yellow-50' 
                              : ''
                          } ${
                              gridDraggingId === music.id 
                                ? 'opacity-45 ring-2 ring-blue-300' 
                                : ''
                          }`}
                          onClick={(e) => handleSelect(music.id, e)}
                          onDoubleClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onPlayMusic(music, { restartSame: true });
                          }}
                        >
                          {/* 灏侀潰 */}
                          <div className={`aspect-[16/9] relative overflow-hidden rounded-t-xl ${
                            music.isPlaying && isPlaying ? 'bg-gradient-to-br from-green-400 via-emerald-500 to-teal-500' : 'bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500'
                          }`}>
                            <div className="absolute inset-0 flex items-center justify-center">
                              {music.isPlaying && isPlaying ? (
                                <div className="flex items-center justify-center">
                                  {/* 鍔ㄦ€佹挱鏀炬寚绀哄櫒 */}
                                  <div className="flex space-x-1">
                                    <div className="w-1 h-6 bg-white rounded-full animate-pulse"></div>
                                    <div className="w-1 h-8 bg-white rounded-full animate-pulse delay-75"></div>
                                    <div className="w-1 h-6 bg-white rounded-full animate-pulse delay-150"></div>
                                    <div className="w-1 h-8 bg-white rounded-full animate-pulse delay-300"></div>
                                  </div>
                                </div>
                              ) : (
                                <MusicNoteIcon className="w-8 h-8 text-white/50" />
                              )}
                            </div>
                            
                            {/* 鎾斁鐘舵€佹爣璇?*/}
                            {music.isPlaying && isPlaying && (
                              <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium animate-pulse shadow-lg">
                                正在播放
                              </div>
                            )}
                            
                            {/* 姝ｅ湪鎾斁鐨勮剦鍔ㄨ竟妗嗘晥鏋?*/}
                            {music.isPlaying && isPlaying && (
                              <div className="absolute inset-0 rounded-xl border-2 border-green-400 animate-ping opacity-75"></div>
                            )}
                            
                            {/* 鎾斁鎸夐挳 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPlayMusic(music);
                              }}
                              className={`absolute inset-0 bg-black/0 hover:bg-black/40 flex items-center justify-center transition-all duration-200 ${
                                music.isPlaying && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                            >
                              {music.isPlaying && isPlaying ? (
                                <PauseIcon className="w-10 h-10 text-white drop-shadow-lg bg-black/20 rounded-full p-2" />
                              ) : (
                                <PlayIcon className="w-8 h-8 text-white drop-shadow-lg" />
                              )}
                            </button>
            
                            {/* 鎿嶄綔鎸夐挳 */}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('点击更多按钮，当前ID:', music.id, '当前contextMenuId:', contextMenuId);
                                  setContextMenuId(contextMenuId === music.id ? null : music.id);
                                }}
                                className="w-6 h-6 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg"
                                title="更多操作"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                </svg>
                              </button>
                            </div>
                          </div>
            
                          {/* 鑿滃崟 - 浣跨敤 fixed 瀹氫綅锛屽畬鍏ㄧ嫭绔嬶紝鏄剧ず鍦ㄥ睆骞曚腑澶?*/}
                          {contextMenuId === music.id && (
                            <>
                              {/* 閬僵灞?- 鐐瑰嚮鍏抽棴鑿滃崟 */}
                              <div 
                                className="fixed inset-0 z-[9998]" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setContextMenuId(null);
                                }}
                              />
                              
                              {/* 鑿滃崟鍐呭 */}
                              <div 
                                className="fixed bg-white dark:bg-slate-800 rounded-lg shadow-2xl border-2 border-blue-500 py-2 z-[9999] min-w-[180px]"
                                style={{
                                  top: '50%',
                                  left: '50%',
                                  transform: 'translate(-50%, -50%)'
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-700">
                                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">操作菜单</p>
                                </div>
                                
                                {/* 閲嶅懡鍚?*/}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingId(music.id);
                                    setEditingName(music.name);
                                    setContextMenuId(null);
                                  }}
                                  className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center space-x-3 transition-colors"
                                >
                                  <EditIcon className="w-5 h-5 text-blue-500" />
                                  <span className="font-medium">重命名</span>
                                </button>
                                
                                {/* 娣诲姞鍒版瓕鍗?*/}
                                {onAddToPlaylist && playlists.length > 0 && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedMusicForPlaylist(music);
                                      setShowAddToPlaylistModal(true);
                                      setContextMenuId(null);
                                    }}
                                    className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center space-x-3 transition-colors"
                                  >
                                    <PlusIcon className="w-5 h-5 text-green-500" />
                                    <span className="font-medium">添加到歌单</span>
                                  </button>
                                )}
                                
                                {/* 鍓緫闊充箰 */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log('点击剪辑按钮，音乐ID:', music.id);
                                    setContextMenuId(null);
                                    setTimeout(() => {
                                      const targetHash = buildAudioEditorHash(music.id, currentPlaylistId);
                                      console.log('设置hash:', targetHash);
                                      window.location.hash = targetHash;
                                    }, 100);
                                  }}
                                  className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center space-x-3 transition-colors"
                                >
                                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                  <span className="font-medium">剪辑音乐</span>
                                </button>
                                
                                <hr className="my-2 border-gray-200 dark:border-slate-700" />
                                
                                {/* 鍒犻櫎 */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteMusic(music.id);
                                    setContextMenuId(null);
                                  }}
                                  className="w-full px-4 py-3 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-3 transition-colors"
                                >
                                  <DeleteIcon className="w-5 h-5" />
                                  <span className="font-medium">删除</span>
                                </button>
                              </div>
                            </>
                          )}

                          {/* 淇℃伅 */}
                          <div className="p-2">
                            <div className="flex items-center justify-between mb-0.5">
                              <h4 className="font-medium text-gray-900 truncate text-sm flex-1">
                              {music.name}
                            </h4>
                              {music.isTrimmed && (
                                <TrimmedIcon className="w-3 h-3 text-orange-500 ml-1 flex-shrink-0" title="已剪辑" />
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate">
                              {music.artist || '未知歌手'}
                            </p>
                            <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400">
                              <span>{music.duration ? formatTime(music.duration) : '--:--'}</span>
                              <span>{music.format.toUpperCase()}</span>
                            </div>
                          </div>
                        </div>
                    </div>
              </React.Fragment>
                  ))}
            {gridDraggingId && gridInsertIndex === sortedMusicFiles.length && (
              <div className="rounded-xl border-2 border-dashed border-blue-500 bg-blue-50/70 min-h-[118px]" />
            )}
                  
          </div>
        )}
      </div>
    );
  }

  // 鍒楄〃瑙嗗浘
  return (
    <div 
      className="bg-white relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 鎷栨嫿瑕嗙洊灞?*/}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-500/20 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center z-50">
          <div className="bg-white/95 backdrop-blur-sm px-8 py-6 rounded-lg shadow-xl">
            <div className="text-center">
              <div className="text-4xl mb-3">♪</div>
              <div className="text-xl font-semibold text-blue-700 mb-1">拖放音乐文件到此处</div>
              <div className="text-sm text-gray-600">支持 MP3, WAV, FLAC, M4A, AAC, OGG 等格式</div>
            </div>
          </div>
        </div>
      )}
      
      {/* 宸ュ叿鏍?*/}
      <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <span>共 {musicFiles.length} 首歌曲</span>
          {selectedIds.size > 0 && (
            <span className="text-blue-600">已选中 {selectedIds.size} 项</span>
          )}
        </div>
      </div>

      {/* 琛ㄥご */}
      <div className="sticky top-0 bg-gray-50 border-b border-gray-200 px-6 py-3">
        <div className="flex items-center text-sm text-gray-600">
          {/* 绉婚櫎鍏ㄩ€夊閫夋 */}
          <div className="w-12">#</div>
          <div className="flex-1 flex items-center">
            标题
          </div>
          <div className="w-48 flex items-center">
            歌手
          </div>
          <div className="w-48">专辑</div>
          <div className="w-24 flex items-center">
            时长
          </div>
          <div className="w-20">格式</div>
          <div className="w-24">大小</div>
          <div className="w-20">操作</div>
        </div>
      </div>

      {/* 鍒楄〃鍐呭 */}
      {musicFiles.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-8xl mb-6">♪</div>
          <h3 className="text-xl font-medium text-gray-900 mb-3">还没有音乐文件</h3>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            点击上方"导入音乐"按钮，或将音乐文件直接拖拽到此处开始使用
          </p>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 bg-gray-50/30 mx-8">
            <div className="text-center">
              <p className="text-base text-gray-600 mb-2">支持的音频格式</p>
              <p className="text-sm text-gray-500">
                MP3, WAV, FLAC, M4A, AAC, OGG, WMA, OPUS
              </p>
            </div>
          </div>
        </div>
      ) : (
          <DragDropContext
          autoScrollerOptions={{
            startFromPercentage: 0.12,
            maxScrollAtPercentage: 0.02,
            maxPixelScroll: 24
          }}
          onDragUpdate={handleDragUpdate}
          onDragEnd={(result) => {
            document.body.style.userSelect = '';
            stopSortingAutoScroll();
            handleDragEnd(result);
          }}
          onDragStart={(start) => {
            document.body.style.userSelect = 'none';
            listDragSourceIdRef.current = start.draggableId;
            listRawInsertIndexRef.current = null;
            setListDragTarget(null);
            startSortingAutoScroll(start.draggableId);
          }}
        >
          <Droppable droppableId="music-list">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`divide-y divide-gray-100 relative overflow-auto ${
                  snapshot.isDraggingOver ? 'bg-blue-50/30' : ''
                }`}
                id="music-scroll-container"
              >
                {sortedMusicFiles.map((music, index) => (
                  <Draggable key={music.id} draggableId={music.id} index={index}>
                      {(dragProvided, dragSnapshot) => (
                      <div
                        id={`music-item-${music.id}`}
                        data-list-sort-item="true"
                        data-list-id={music.id}
                        data-list-index={index}
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        {...dragProvided.dragHandleProps}
                          className={`group px-6 py-3 cursor-grab active:cursor-grabbing select-none ${
                          selectedIds.has(music.id) ? 'bg-blue-50' : ''
                        } ${
                          music.isPlaying && isPlaying
                            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-500 shadow-lg shadow-green-200/50 relative'
                            : currentMusic?.id === music.id
                              ? 'bg-purple-50'
                              : 'hover:bg-gray-50'
                        } ${
                          highlightedId === music.id
                            ? 'bg-yellow-100 border-l-4 border-yellow-400 shadow-lg'
                            : ''
                          } ${
                            dragSnapshot.isDragging
                              ? 'bg-white border border-blue-200 rounded-md'
                              : ''
                        }`}
                        style={{
                          ...dragProvided.draggableProps.style,
                          zIndex: dragSnapshot.isDragging ? 1000 : (dragProvided.draggableProps.style as any)?.zIndex,
                          boxShadow: dragSnapshot.isDragging
                            ? '0 14px 28px rgba(15, 23, 42, 0.18)'
                            : listDragTargetIndex === index
                              ? 'inset 0 3px 0 #2563eb'
                              : listDragTargetIndex === sortedMusicFiles.length && index === sortedMusicFiles.length - 1
                                ? 'inset 0 -3px 0 #2563eb'
                                : (dragProvided.draggableProps.style as any)?.boxShadow
                        }}
                        onClick={(e) => handleSelect(music.id, e)}
                        onDoubleClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onPlayMusic(music, { restartSame: true });
                        }}
                      >
                        {/* 姝ｅ湪鎾斁鐨勮剦鍔ㄨ竟妗嗘晥鏋?*/}
                        {music.isPlaying && isPlaying && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-400 animate-pulse"></div>
                        )}
                        
                        <div className="flex items-center text-sm">
                          {/* 琛屽閫夋宸茬Щ闄?*/}
                          
                          <div className="w-12 text-gray-500">
                            {music.isPlaying && isPlaying ? (
                              <div className="flex items-center space-x-0.5">
                                <span className="w-1 h-4 bg-green-600 rounded-full animate-pulse"></span>
                                <span className="w-1 h-3 bg-green-600 rounded-full animate-pulse delay-75"></span>
                                <span className="w-1 h-5 bg-green-600 rounded-full animate-pulse delay-150"></span>
                              </div>
                            ) : (
                              <span>{index + 1}</span>
                            )}
                          </div>
                          
                          <div className="flex-1 flex items-center space-x-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPlayMusic(music);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              {music.isPlaying && isPlaying ? (
                                <PauseIcon className="w-4 h-4 text-gray-600 hover:text-gray-900" />
                              ) : (
                                <PlayIcon className="w-4 h-4 text-gray-600 hover:text-gray-900" />
                              )}
                            </button>
                            
                            {editingId === music.id ? (
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={handleSaveEdit}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEdit();
                                  if (e.key === 'Escape') handleCancelEdit();
                                }}
                                className="flex-1 px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div className="flex items-center space-x-1 flex-1">
                              <span className={`font-medium truncate ${
                                music.isPlaying && isPlaying 
                                  ? 'text-green-700 font-bold drop-shadow-sm' 
                                  : 'text-gray-900'
                              }`}>
                                {music.isPlaying && isPlaying && (
                                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse shadow-sm"></span>
                                )}
                                {music.name}
                              </span>
                                {music.isTrimmed && (
                                  <TrimmedIcon className="w-3 h-3 text-orange-500 ml-1 flex-shrink-0" title="已剪辑" />
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="w-48 text-gray-600 truncate">
                            {music.artist || '未知歌手'}
                          </div>
                          
                          <div className="w-48 text-gray-600 truncate">
                            {music.album || '未知专辑'}
                          </div>
                          
                          <div className="w-24 text-gray-500">
                            {music.duration ? formatTime(music.duration) : '--:--'}
                          </div>
                          
                          <div className="w-20 text-gray-500">
                            {music.format.toUpperCase()}
                          </div>
                          
                          <div className="w-24 text-gray-500">
                            {formatFileSize(music.fileSize)}
                          </div>
                          
                          <div className="w-20 flex items-center space-x-1">
                            {/* 鏀惰棌鎸夐挳宸茬Щ闄?*/}
                            
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setContextMenuId(contextMenuId === music.id ? null : music.id);
                                }}
                                className="p-1 rounded hover:bg-gray-200 transition-colors"
                              >
                                <MoreIcon className="w-4 h-4 text-gray-400" />
                              </button>
                              
                              {contextMenuId === music.id && (
                                <div className="absolute right-0 top-8 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 w-48">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartEdit(music);
                                      setContextMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                                  >
                                    <EditIcon className="w-4 h-4" />
                                    <span>重命名</span>
                                  </button>
                                  
                                  {/* 娣诲姞鍒版瓕鍗?*/}
                                  {onAddToPlaylist && playlists.length > 0 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedMusicForPlaylist(music);
                                        setShowAddToPlaylistModal(true);
                                        setContextMenuId(null);
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                                    >
                                      <PlusIcon className="w-4 h-4" />
                                      <span>添加到歌单</span>
                                    </button>
                                  )}
                                  
                                  {/* 鍓緫闊充箰 */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log('点击剪辑按钮，音乐ID:', music.id);
                                      setContextMenuId(null);
                                      setTimeout(() => {
                                        const targetHash = buildAudioEditorHash(music.id, currentPlaylistId);
                                        console.log('设置hash:', targetHash);
                                        window.location.hash = targetHash;
                                      }, 100);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    <span>剪辑音乐</span>
                                  </button>
                                  
                                  <hr className="my-1" />
                                  
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteMusic(music.id);
                                      setContextMenuId(null);
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                                  >
                                    <DeleteIcon className="w-4 h-4" />
                                    <span>删除</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
      
      {/* 娣诲姞鍒版瓕鍗曟ā鎬佹 */}
      {showAddToPlaylistModal && selectedMusicForPlaylist && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-h-[70vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              选择歌单
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              将"{selectedMusicForPlaylist.name}" 添加到：
            </p>
            <div className="space-y-2">
              {playlists.map(playlist => (
                <button
                  key={playlist.id}
                  onClick={() => {
                    if (onAddToPlaylist) {
                      onAddToPlaylist(selectedMusicForPlaylist.id, playlist.id);
                    }
                    setShowAddToPlaylistModal(false);
                    setSelectedMusicForPlaylist(null);
                  }}
                  className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-md flex items-center justify-center">
                      <MusicNoteIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{playlist.name}</div>
                      {playlist.description && (
                        <div className="text-xs text-gray-500 mt-1">
                          {playlist.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <PlusIcon className="w-5 h-5 text-gray-400" />
                </button>
              ))}
              {playlists.length === 0 && (
                <p className="text-center py-8 text-gray-500">
                  暂无歌单，请先创建歌单
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setShowAddToPlaylistModal(false);
                  setSelectedMusicForPlaylist(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

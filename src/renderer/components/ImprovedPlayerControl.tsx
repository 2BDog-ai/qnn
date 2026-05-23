import React, { useEffect, useRef } from 'react';
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  PreviousIcon,
  NextIcon,
  VolumeHighIcon,
  VolumeMuteIcon,
  RepeatAllIcon,
  RepeatOneIcon,
  ShuffleIcon,
  ListIcon
} from './icons/AudioIcons';

interface ImprovedPlayerControlProps {
  currentMusic: any;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  isMuted: boolean;
  playMode: 'sequential' | 'loop' | 'single' | 'shuffle';
  isDragging: boolean;
  isHovering: boolean;
  dragTime: number;
  currentPlayingPlaylist?: any; // 当前播放的歌单信息
  onTogglePlayPause: () => void;
  onRestartCurrent: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePlayMode: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onProgressBarClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onProgressBarMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSliderMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onProgressBarMouseEnter: () => void;
  onProgressBarMouseLeave: () => void;
  progressBarRef: React.RefObject<HTMLDivElement>;
}

export const ImprovedPlayerControl: React.FC<ImprovedPlayerControlProps> = ({
  currentMusic,
  isPlaying,
  currentTime,
  volume,
  isMuted,
  playMode,
  isDragging,
  isHovering,
  dragTime,
  currentPlayingPlaylist,
  onTogglePlayPause,
  onRestartCurrent,
  onStop,
  onPrevious,
  onNext,
  onTogglePlayMode,
  onVolumeChange,
  onToggleMute,
  onProgressBarClick,
  onProgressBarMouseDown,
  onSliderMouseDown,
  onProgressBarMouseEnter,
  onProgressBarMouseLeave,
  progressBarRef
}) => {
  const playButtonClickTimerRef = useRef<number | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      if (playButtonClickTimerRef.current !== null) {
        window.clearTimeout(playButtonClickTimerRef.current);
      }
    };
  }, []);

  const handlePlayButtonClick = () => {
    if (playButtonClickTimerRef.current !== null) return;

    playButtonClickTimerRef.current = window.setTimeout(() => {
      onTogglePlayPause();
      playButtonClickTimerRef.current = null;
    }, 220);
  };

  const handlePlayButtonDoubleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (playButtonClickTimerRef.current !== null) {
      window.clearTimeout(playButtonClickTimerRef.current);
      playButtonClickTimerRef.current = null;
    }
    onRestartCurrent();
  };

  if (!currentMusic) return null;

  return (
    <div className="bg-gray-100 dark:bg-gradient-to-r dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 text-gray-900 dark:text-white px-8 py-6 shadow-2xl">
      {/* 顶部区域：歌曲信息 */}
      <div className="flex items-center justify-between mb-6">
        {/* 歌曲信息 */}
        <div className="flex items-center space-x-4 flex-1">
          <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-xl">
              {currentMusic.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate mb-1">
              {currentMusic.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {currentMusic.artist || '未知歌手'} • {currentMusic.album || '未知专辑'}
            </p>
            {/* 显示歌单信息 */}
            {currentPlayingPlaylist && (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  来自歌单: {currentPlayingPlaylist.name}
                </span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 进度条 */}
      <div className="mb-6">
        <div className="flex items-center space-x-3 text-sm mb-2">
          <span className="font-mono text-gray-600 dark:text-gray-300 w-12 text-right">
            {formatTime(isDragging ? dragTime : currentTime)}
          </span>
          <div className="flex-1 relative">
            <div 
              ref={progressBarRef}
              className={`bg-gray-300 dark:bg-gray-700 rounded-full cursor-pointer relative overflow-visible transition-all duration-200 ${
                isHovering || isDragging ? 'h-5' : 'h-3'
              }`}
              onClick={onProgressBarClick}
              onMouseEnter={onProgressBarMouseEnter}
              onMouseLeave={onProgressBarMouseLeave}
              onMouseDown={onProgressBarMouseDown}
            >
              {/* 已播放进度 */}
              <div 
                className={`h-full rounded-full transition-all duration-150 ${
                  isDragging ? 'bg-gradient-to-r from-blue-500 to-purple-500' : 'bg-gradient-to-r from-blue-400 to-purple-400'
                }`}
                style={{ width: `${(isDragging ? dragTime : currentTime) / (currentMusic.duration || 1) * 100}%` }}
              />
              
              {/* 缓冲进度 */}
              <div 
                className="absolute top-0 left-0 h-full bg-gray-400 dark:bg-gray-600 rounded-full -z-10"
                style={{ width: `${Math.min((currentTime + 30) / (currentMusic.duration || 1) * 100, 100)}%` }}
              />
              
              {/* 可拖动圆点 */}
              <div 
                className={`absolute top-1/2 w-6 h-6 bg-white rounded-full shadow-lg transform -translate-y-1/2 -translate-x-1/2 transition-all duration-200 cursor-grab ${
                  isDragging ? 'scale-125 shadow-2xl cursor-grabbing' : 
                  (isHovering ? 'scale-110 opacity-100' : 'scale-100 opacity-0')
                }`}
                style={{ 
                  left: `${(isDragging ? dragTime : currentTime) / (currentMusic.duration || 1) * 100}%`
                }}
                onMouseDown={onSliderMouseDown}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full scale-50" />
              </div>
              
              {/* 悬停时的时间提示 */}
              {(isHovering || isDragging) && (
                <div 
                  className={`absolute bottom-8 px-3 py-1.5 bg-black/90 text-white text-xs rounded-lg transform -translate-x-1/2 transition-all duration-200 ${
                    isDragging ? 'opacity-100 scale-110' : 'opacity-90'
                  }`}
                  style={{ left: `${(isDragging ? dragTime : currentTime) / (currentMusic.duration || 1) * 100}%` }}
                >
                  {formatTime(isDragging ? dragTime : currentTime)}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 -translate-y-1 border-l-4 border-r-4 border-t-4 border-transparent border-t-black/90" />
                </div>
              )}
            </div>
          </div>
          <span className="font-mono text-gray-300 w-12">
            {currentMusic.duration ? formatTime(currentMusic.duration) : '--:--'}
          </span>
        </div>
      </div>

      {/* 控制按钮区域 */}
      <div className="flex items-center justify-between">
        {/* 播放控制按钮组 */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onPrevious}
            className="p-3 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all rounded-full hover:bg-gray-200/10 dark:hover:bg-white/10 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            title="上一首"
          >
            <PreviousIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
           
          <button
            onClick={onStop}
            className="p-3 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all rounded-full hover:bg-gray-200/10 dark:hover:bg-white/10 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            title="停止"
          >
            <StopIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
           
          <button 
            onClick={handlePlayButtonClick}
            onDoubleClick={handlePlayButtonDoubleClick}
            className="relative p-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-full transition-all transform hover:scale-105 shadow-xl group focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-opacity-75"
            title={isPlaying ? "暂停（双击从头播放）" : "播放（双击从头播放）"}
          >
            <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" />
            {isPlaying ? (
              <PauseIcon className="w-8 h-8 relative z-10" />
            ) : (
              <PlayIcon className="w-8 h-8 relative z-10 translate-x-0.5" />
            )}
          </button>
           
          <button
            onClick={onNext}
            className="p-3 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all rounded-full hover:bg-gray-200/10 dark:hover:bg-white/10 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            title="下一首"
          >
            <NextIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
        </div>

        {/* 音量控制 */}
        <div className="flex items-center space-x-4">
          {/* 音量调节 */}
          <div className="flex items-center space-x-3 bg-gray-200/50 dark:bg-gray-800/50 rounded-lg px-4 py-2">
            <button
              onClick={onToggleMute}
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
              title={isMuted ? "取消静音" : "静音"}
            >
              {isMuted ? (
                <VolumeMuteIcon className="w-5 h-5" />
              ) : (
                <VolumeHighIcon className="w-5 h-5" />
              )}
            </button>
            <div className="relative w-32">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-300 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 focus:ring-offset-1"
                style={{
                  background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${(isMuted ? 0 : volume) * 100}%, #9CA3AF ${(isMuted ? 0 : volume) * 100}%, #9CA3AF 100%) dark: #374151`
                }}
                title="音量调节"
              />
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                {Math.round((isMuted ? 0 : volume) * 100)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

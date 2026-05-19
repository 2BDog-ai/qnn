import React from 'react';
import { useThemeStore } from '../store/themeStore';
import {
  MusicIcon,
  MicrophoneIcon,
  ConvertIcon,
  MoreIcon,
  CutIcon,
  MemoIcon
} from './icons/AudioIcons';

interface TopNavigationProps {
  activeModule: string;
  onModuleChange: (module: string) => void;
  isRecording?: boolean;
  recordingTime?: number;
  onStopRecording?: () => void;
}

export const TopNavigation: React.FC<TopNavigationProps> = ({
  activeModule,
  onModuleChange,
  isRecording = false,
  recordingTime = 0,
  onStopRecording,
}) => {
  const { getCurrentThemeColors } = useThemeStore();
  const themeColors = getCurrentThemeColors();

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

  const navigationItems = [
    {
      id: 'music-playback',
      name: '音乐播放',
      icon: MusicIcon,
      description: '播放音乐、管理播放列表'
    },
    {
      id: 'console-recording',
      name: '控台录音',
      icon: MicrophoneIcon,
      description: '录制系统音频+话筒声音'
    },
    {
      id: 'audio-converter',
      name: '音频转换',
      icon: ConvertIcon,
      description: '格式转换、质量调节'
    },
    {
      id: 'vocal-remover',
      name: '人声消除',
      icon: ConvertIcon,
      description: '消除人声、保留伴奏'
    },
    {
      id: 'audio-editor',
      name: '音频剪辑',
      icon: CutIcon,
      description: '剪辑音频、调整音量'
    },
    {
      id: 'favorites-notes',
      name: '收藏记录',
      icon: MemoIcon,
      description: '像备忘录一样的收藏记录'
    },
    {
      id: 'more-features',
      name: '更多功能',
      icon: MoreIcon,
      description: '高级功能、设置选项'
    }
  ];

  return (
    <div 
      className={`${themeColors.topBarBg} border-b ${themeColors.topBarBorder} px-6 pt-2 pb-1 shadow-sm`}
      style={{ ['WebkitAppRegion' as any]: 'drag' }}
      id="top-navigation-bar"
    >
      <div className="flex items-center justify-between">
        {/* 功能模块按钮区域容器：动态主题背景 */}
        <div className="relative flex-1 flex justify-center" style={{ ['WebkitAppRegion' as any]: 'no-drag' }}>
          <div className={`relative rounded-2xl ${themeColors.moduleContainerBg} px-3 py-2 shadow-sm ring-1 ${themeColors.moduleContainerRing}`}>
            <div className="flex justify-evenly items-center gap-2 max-w-4xl w-full">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;

                return (
                  <div key={item.id} className="relative">
                    {/* 半圆指示器（仅激活时显示） */}
                    {isActive && (
                      <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-4 ${themeColors.activeModuleIndicator} rounded-b-full shadow-sm`} />
                    )}

                    <button
                      onClick={() => onModuleChange(item.id)}
                      className={`relative flex flex-col items-center px-2 py-1.5 rounded-xl transition-all duration-200 min-w-[68px] ${
                        isActive
                          ? `${themeColors.activeModuleBg} ${themeColors.activeModuleText} ${themeColors.activeShadow} translate-y-[-2px]`
                          : `${themeColors.hoverModuleBg} ${themeColors.inactiveModuleText} ${themeColors.hoverModuleText}`
                      }`}
                      title={item.description}
                      style={{ ['WebkitAppRegion' as any]: 'no-drag' }}
                    >
                      <Icon 
                        className={`w-6 h-6 mb-0.5 ${
                          isActive ? themeColors.activeModuleIcon : themeColors.inactiveModuleIcon
                        }`}
                      />
                      <span className={`text-sm font-medium ${
                        isActive ? themeColors.activeModuleText : themeColors.inactiveModuleText
                      }`}>
                        {item.name}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* 右侧：音乐下载按钮、录音指示器、主题切换和手卡 */}
        <div className="flex items-center gap-3 ml-4" style={{ ['WebkitAppRegion' as any]: 'no-drag' }}>
          {/* 音乐下载网站跳转按钮 */}
          <button
            onClick={() => {
              // 使用 Electron 的 shell 打开外部链接
              if (window.electronAPI?.shell?.openExternal) {
                window.electronAPI.shell.openExternal('https://www.gequbao.com');
              } else {
                // 备用方案：使用 window.open
                window.open('https://www.gequbao.com', '_blank');
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${themeColors.hoverModuleBg} ${themeColors.inactiveModuleText} hover:${themeColors.activeModuleBg} hover:${themeColors.activeModuleText} hover:shadow-md`}
            title="打开音乐下载网站 - 下载音乐资源"
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" 
              />
            </svg>
            <span className="text-sm font-medium">音乐下载</span>
            <svg 
              className="w-4 h-4" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" 
              />
            </svg>
          </button>
          
          {/* 全局录音状态指示器 */}
          {isRecording && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <MicrophoneIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  录音中 {formatRecordingTime(recordingTime)}
                </span>
              </div>
              {onStopRecording && (
                <button
                  onClick={onStopRecording}
                  className="ml-2 px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition-colors"
                  title="停止录音"
                >
                  停止
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

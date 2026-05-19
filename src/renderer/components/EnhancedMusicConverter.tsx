import React, { useState, useRef, useEffect } from 'react';
import { offlineAudioConverter as audioConverter, ConvertOptions, ConversionProgress } from '../utils/offlineAudioConverter';
import {
  ConvertIcon,
  FileIcon,
  FolderIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  ProgressIcon,
  LoadingIcon,
  SaveIcon,
  DeleteIcon,
  MoreIcon,
  ClockIcon,
  VolumeHighIcon
} from './icons/AudioIcons';

interface ConversionSettings {
  outputFormat: 'mp3' | 'wav' | 'flac' | 'm4a' | 'aac' | 'ogg';
  bitrate: number;
  sampleRate: number;
  channels: number;
  quality: 'low' | 'medium' | 'high';
  outputDirectory: string;
}

export const EnhancedMusicConverter: React.FC = () => {
  const [conversionProgress, setConversionProgress] = useState<ConversionProgress[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [settings, setSettings] = useState<ConversionSettings>({
    outputFormat: 'mp3',
    bitrate: 320,
    sampleRate: 44100,
    channels: 2,
    quality: 'high',
    outputDirectory: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化默认输出目录为桌面
  useEffect(() => {
    const initOutputDir = async () => {
      try {
        if (window.electronAPI?.app?.getDesktopPath) {
          const desktopPath = await window.electronAPI.app.getDesktopPath();
          if (desktopPath) {
            setSettings(prev => ({ ...prev, outputDirectory: desktopPath }));
            return;
          }
        }
      } catch (error) {
        console.warn('获取桌面路径失败:', error);
      }
    };
    initOutputDir();
  }, []);

  // 监听转换进度更新
  useEffect(() => {
    const interval = setInterval(() => {
      const progress = audioConverter.getAllProgress();
      setConversionProgress(progress);
    }, 300); // 增加间隔，减少UI更新频率，避免阻塞

    return () => clearInterval(interval);
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        try {
          // 直接添加文件到队列，不保存选项和输出目录，在转换时使用最新的设置
          audioConverter.addToQueue(file, null);
        } catch (error) {
          console.error(`添加文件 ${file.name} 到转换队列失败:`, error);
          alert(`不支持转换文件 ${file.name}`);
        }
      });
    }
    
    // 清空input值，允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startConversion = async () => {
    try {
      console.log('开始转换函数被调用');
      console.log('当前转换进度:', conversionProgress);
      
      if (conversionProgress.length === 0) {
        alert('请先添加要转换的文件');
        return;
      }
      
      // 检查是否有等待中的文件
      const waitingFiles = conversionProgress.filter(item => item.status === 'waiting');
      console.log('等待中的文件:', waitingFiles);
      
      if (waitingFiles.length === 0) {
        alert('没有等待转换的文件');
        return;
      }
      
      // 检查输出目录
      if (!settings.outputDirectory || settings.outputDirectory.trim() === '') {
        alert('请先选择输出目录');
        return;
      }
      
      console.log('准备调用audioConverter.startConversion()');
      setIsConverting(true);
      
      // 立即开始转换，避免setTimeout导致的UI阻塞
      try {
        // 传递当前的转换设置
        const currentOptions: ConvertOptions = {
          format: settings.outputFormat,
          bitrate: settings.bitrate,
          sampleRate: settings.sampleRate,
          channels: settings.channels,
          quality: settings.quality
        };
        
        await audioConverter.startConversion(currentOptions, settings.outputDirectory);
        console.log('开始转换队列中的文件');
      } catch (error) {
        console.error('转换过程中发生错误:', error);
        // 不显示alert，让用户通过进度界面看到错误
      } finally {
        setIsConverting(false);
      }
      
    } catch (error) {
      console.error('开始转换失败:', error);
      setIsConverting(false);
      alert('开始转换失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const pauseConversion = () => {
    audioConverter.pauseConversion();
    console.log('暂停转换');
  };

  const cancelConversion = (fileId: string) => {
    audioConverter.cancelConversion(fileId);
  };

  const clearCompleted = () => {
    audioConverter.clearHistory();
  };

  const saveConversionResult = async (fileId: string) => {
    try {
      const success = await audioConverter.saveConversionResult(fileId, settings.outputDirectory);
      if (success) {
        alert('保存成功！');
      } else {
        alert('保存失败，请检查文件状态');
      }
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败: ' + error);
    }
  };

  const saveAllCompleted = async () => {
    try {
      const result = await audioConverter.saveAllCompletedResults(settings.outputDirectory);
      alert(`批量保存完成！成功: ${result.success} 个，失败: ${result.failed} 个`);
    } catch (error) {
      console.error('批量保存失败:', error);
      alert('批量保存失败: ' + error);
    }
  };

  const handleSelectOutputDirectory = async () => {
    try {
      console.log('开始选择输出目录...');
      // 在Electron环境中，使用主进程的对话框选择文件夹
      if (window.electronAPI?.system?.openFolder) {
        const result = await window.electronAPI.system.openFolder();
        console.log('选择目录结果:', result);
        
        if (result && result.filePaths && result.filePaths.length > 0) {
          const selectedPath = result.filePaths[0];
          console.log('选择的目录路径:', selectedPath);
          setSettings(prev => ({ ...prev, outputDirectory: selectedPath }));
          console.log('输出目录已更新为:', selectedPath);
        } else {
          console.log('用户取消了目录选择');
        }
      } else {
        // 如果不在Electron环境中，使用HTML5的文件选择器模拟
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.multiple = false;
        
        input.onchange = (e) => {
          const target = e.target as HTMLInputElement;
          if (target.files && target.files.length > 0) {
            const folderPath = target.files[0].path || target.files[0].webkitRelativePath.split('/')[0];
            setSettings(prev => ({ ...prev, outputDirectory: folderPath }));
          }
        };
        
        input.click();
      }
    } catch (error) {
      console.error('选择输出目录失败:', error);
      alert('选择输出目录失败: ' + error);
    }
  };

  const formatFileSize = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getQueueStatus = () => {
    return audioConverter.getQueueStatus();
  };

  const getFFmpegStatus = () => {
    return audioConverter.getFFmpegStatus();
  };

  return (
    <div className="flex-1 bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <ConvertIcon className="w-6 h-6 text-blue-600 mr-3" />
              音乐转码
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              支持多种音频格式转换，可调节音质和输出设置<br/>
              <span className="text-gray-600 text-sm">支持常见音频格式转换</span>
            </p>
            {/* FFmpeg状态显示 */}
            <div className="mt-3">
              {(() => {
                const ffmpegStatus = getFFmpegStatus();
                const isReady = ffmpegStatus === 'ready';
                const isFallback = ffmpegStatus === 'fallback';
                const isError = ffmpegStatus === 'error';
                const isLoading = ffmpegStatus === 'loading';
                
                return (
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                    isReady 
                      ? 'bg-green-100 text-green-800' 
                      : isFallback
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    <div className={`w-2 h-2 rounded-full mr-2 ${
                      isReady ? 'bg-green-500' : isFallback ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></div>
                    FFmpeg: {
                      isReady ? '已加载' : 
                      isFallback ? '使用备用方案' : 
                      isError ? '加载失败' : 
                      '加载中...'
                    }
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="p-6">
            {/* 转换设置 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    输出格式
                  </label>
                  <select
                    value={settings.outputFormat}
                    onChange={(e) => setSettings(prev => ({ 
                      ...prev, 
                      outputFormat: e.target.value as any 
                    }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="mp3">MP3 - 压缩格式，兼容性好</option>
                    <option value="wav">WAV - 无损格式，音质最佳</option>
                    <option value="flac">FLAC - 无损压缩，音质好文件小</option>
                    <option value="m4a">M4A - 苹果设备兼容性好</option>
                    <option value="aac">AAC - 高质量压缩格式</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    比特率: {settings.bitrate} kbps
                  </label>
                  <input
                    type="range"
                    min="64"
                    max="320"
                    step="32"
                    value={settings.bitrate}
                    onChange={(e) => setSettings(prev => ({ 
                      ...prev, 
                      bitrate: parseInt(e.target.value) 
                    }))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    采样率: {settings.sampleRate} Hz
                  </label>
                  <select
                    value={settings.sampleRate}
                    onChange={(e) => setSettings(prev => ({ 
                      ...prev, 
                      sampleRate: parseInt(e.target.value) 
                    }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={22050}>22050 Hz</option>
                    <option value={44100}>44100 Hz</option>
                    <option value={48000}>48000 Hz</option>
                    <option value={96000}>96000 Hz</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    声道数
                  </label>
                  <select
                    value={settings.channels}
                    onChange={(e) => setSettings(prev => ({ 
                      ...prev, 
                      channels: parseInt(e.target.value) 
                    }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={1}>单声道 (1)</option>
                    <option value={2}>立体声 (2)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    输出目录
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={settings.outputDirectory}
                      onChange={(e) => setSettings(prev => ({ 
                        ...prev, 
                        outputDirectory: e.target.value 
                      }))}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="默认输出到桌面"
                    />
                    <button
                      onClick={handleSelectOutputDirectory}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                      title="另存为"
                    >
                      另存为
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 文件选择和转换控制 */}
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  <FileIcon className="w-5 h-5" />
                  <span>添加文件</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="audio/*,.ncm,.kgm,.kgg,.vpr"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                <button
                  onClick={startConversion}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors font-medium"
                >
                  <ConvertIcon className="w-5 h-5" />
                  <span>开始转换</span>
                </button>

                <button
                  onClick={pauseConversion}
                  className="flex items-center space-x-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors font-medium"
                >
                  <PauseIcon className="w-5 h-5" />
                  <span>暂停转换</span>
                </button>
              </div>

              {/* 队列状态 */}
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{getQueueStatus().total}</div>
                    <div className="text-sm text-gray-600">总任务</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{getQueueStatus().completed}</div>
                    <div className="text-sm text-gray-600">已完成</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">{getQueueStatus().waiting}</div>
                    <div className="text-sm text-gray-600">队列中</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">{getQueueStatus().error}</div>
                    <div className="text-sm text-gray-600">失败</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 转换进度列表 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">转换进度</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={saveAllCompleted}
                    className="px-3 py-1 text-sm bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors"
                  >
                    批量保存已完成
                  </button>
                  <button
                    onClick={clearCompleted}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    清空历史
                  </button>
                </div>
              </div>
              
              {conversionProgress.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ConvertIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">暂无转换任务</p>
                  <p className="text-sm">点击"添加文件"开始转换</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {conversionProgress.map((item) => (
                    <div
                      key={item.fileId}
                      className="bg-white border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileIcon className="w-6 h-6 text-blue-600" />
                          </div>

                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 mb-1">{item.fileName}</h4>
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                              <span>状态: {
                                item.status === 'waiting' && '等待中'
                                || item.status === 'converting' && '转换中'
                                || item.status === 'completed' && '已完成'
                                || item.status === 'error' && '失败'
                              }</span>
                              {item.estimatedTime && item.status === 'converting' && (
                                <span>预计剩余: {formatTime(item.estimatedTime)}</span>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-sm text-gray-600 mb-1">
                              {item.progress.toFixed(1)}%
                            </div>
                            
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 ${
                                  item.status === 'completed' ? 'bg-green-500' :
                                  item.status === 'error' ? 'bg-red-500' :
                                  'bg-blue-500'
                                }`}
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                            {item.currentStep && (
                              <div className="text-xs text-blue-600 mt-1 truncate w-24">
                                {item.currentStep}
                              </div>
                            )}
                          </div>
                        </div>

                        {item.status === 'waiting' && (
                          <button
                            onClick={() => cancelConversion(item.fileId)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-4"
                            title="取消转换"
                          >
                            <StopIcon className="w-4 h-4" />
                          </button>
                        )}

                        {item.status === 'completed' && (
                          <button
                            onClick={() => saveConversionResult(item.fileId)}
                            className="p-2 text-green-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors ml-4"
                            title="保存到指定目录"
                          >
                            <SaveIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      
                      {item.error && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-700">错误: {item.error}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

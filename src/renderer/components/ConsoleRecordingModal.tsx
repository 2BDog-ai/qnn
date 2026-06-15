import React, { useState, useEffect } from 'react';
import {
  MicrophoneIcon,
  PlayIcon,
  SaveIcon,
  SettingsIcon
} from './icons/AudioIcons';

interface ConsoleRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartRecording: (options: ConsoleRecordingOptions) => void;
}

interface ConsoleRecordingOptions {
  deviceId: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  outputFormat: 'wav' | 'mp3' | 'flac';
  outputPath: string;
}

interface AudioDevice {
  id: string;
  name: string;
  type: string;
}

export const ConsoleRecordingModal: React.FC<ConsoleRecordingModalProps> = ({
  isOpen,
  onClose,
  onStartRecording
}) => {
  // 状态管理
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [channels, setChannels] = useState<number>(1);
  const [bitDepth, setBitDepth] = useState<number>(16);
  const [outputFormat, setOutputFormat] = useState<'wav' | 'mp3' | 'flac'>('wav');
  const [outputPath, setOutputPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // 组件挂载时初始化
  useEffect(() => {
    if (isOpen) {
      // Force reset states
      setAudioDevices([]);
      setSelectedDevice('');
      setErrorMessage('');
      setIsStarting(false);
      initializeModal();
      
      // 禁用窗口拖动
      const topNav = document.getElementById('top-navigation-bar');
      if (topNav) {
        (topNav.style as any)['-webkit-app-region'] = 'no-drag';
      }
      // Check microphone permission on Mac
      if (navigator.userAgent.includes('Macintosh') && navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            stream.getTracks().forEach(track => track.stop());
          })
          .catch(err => {
            if (err.name === 'NotAllowedError') {
              setErrorMessage('请在系统设置中授予麦克风权限');
            }
          });
      }
    } else {
      // 恢复窗口拖动
      const topNav = document.getElementById('top-navigation-bar');
      if (topNav) {
        (topNav.style as any)['-webkit-app-region'] = 'drag';
      }
    }
  }, [isOpen]);

  // 初始化模态框
  const initializeModal = async () => {
    setErrorMessage('');

    const platform = window.electronAPI?.system?.getPlatform?.();
    if (platform === 'darwin') {
      setSampleRate(48000);
      setChannels(1);
      setBitDepth(24);
    } else {
      setSampleRate(44100);
      setChannels(1);
      setBitDepth(16);
    }
    
    // 设置默认输出路径
    try {
      if (window.electronAPI?.app?.getPath) {
        const desktopPath = await window.electronAPI.app.getPath('desktop');
        setOutputPath(desktopPath);
      } else {
        setOutputPath('/Users/laojian/Desktop');
      }
    } catch (error) {
      console.error('获取桌面路径失败:', error);
      setOutputPath('/Users/laojian/Desktop');
    }

    // 加载音频设备
    await loadAudioDevices();
  };

  // 加载音频设备列表
  const loadAudioDevices = async () => {
    try {
      setIsLoading(true);
      setErrorMessage('');
      setAudioDevices([]); // Force clear before loading
      setSelectedDevice('');
      
      console.log('开始获取音频设备... (Force refresh)');
      
      if (window.electronAPI?.consoleRecording?.getDevices) {
        const devices = await window.electronAPI.consoleRecording.getDevices();
        console.log('获取到设备:', devices);
        
        if (devices && devices.length > 0) {
          setAudioDevices(devices);
          // 默认选择第一个输入设备
          const inputDevice = devices.find((d: AudioDevice) => d.type === 'input') || devices[0];
          setSelectedDevice(inputDevice.id);
        } else {
          setAudioDevices([]);
          setSelectedDevice('');
          setErrorMessage('未检测到可用录音设备，请确认线路输入/麦克风已连接后点击刷新');
        }
      } else {
        setAudioDevices([]);
        setSelectedDevice('');
        setErrorMessage('音频设备API不可用，请重启应用后重试');
      }
    } catch (error) {
      console.error('加载音频设备失败:', error);
      setAudioDevices([]);
      setSelectedDevice('');
      setErrorMessage('加载录音设备失败，请检查设备连接后点击刷新');
    } finally {
      setIsLoading(false);
    }
  };

  // 选择输出目录
  const handleSelectOutputDirectory = async () => {
    try {
      if (window.electronAPI?.dialog?.openFolder) {
        const result = await window.electronAPI.dialog.openFolder({
          title: '选择录音保存位置',
          defaultPath: outputPath
        });
        
        if (result) {
          setOutputPath(result);
          console.log('选择的路径:', result);
        }
      } else {
        // 使用输入框让用户手动输入
        const newPath = prompt('请输入录音保存路径:', outputPath);
        if (newPath) {
          setOutputPath(newPath);
        }
      }
    } catch (error) {
      console.error('选择目录失败:', error);
      alert('选择目录失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 开始录音
  const handleStartRecording = () => {
    if (isStarting) {
      return;
    }

    if (!selectedDevice) {
      alert('请选择录音设备');
      return;
    }

    if (!outputPath) {
      alert('请选择保存位置');
      return;
    }

    // 生成文件名
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const fileName = `录音_${timestamp}.${outputFormat}`;
    const fullPath = `${outputPath}/${fileName}`;

    const options: ConsoleRecordingOptions = {
      deviceId: selectedDevice,
      sampleRate,
      channels,
      bitDepth,
      outputFormat,
      outputPath: fullPath
    };

    console.log('开始录音，参数:', options);
    setIsStarting(true);
    onStartRecording(options);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      style={{ pointerEvents: 'none' }} // Prevent backdrop from blocking
    >
      <div 
        className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md"
        style={{ pointerEvents: 'auto' }} // Allow interactions on content
      >
        {/* 标题栏 */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <MicrophoneIcon className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">录音设置</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">{errorMessage}</p>
          </div>
        )}

        {/* 内容区域 */}
        <div className="px-6 py-4 space-y-6">
          {/* 录音设备选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              录音设备
            </label>
            {/* For dropdown and button */}
            <div className="flex space-x-2 pointer-events-auto"> {/* Ensure interaction */}
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="w-full p-2 border rounded bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading || audioDevices.length === 0}
                style={{ pointerEvents: 'auto', zIndex: 1000 }} // Ensure clickable and on top
              >
                <option value="">选择设备</option>
                {audioDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} ({device.type})
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  if (isLoading) return; // Prevent click if already loading
                  loadAudioDevices();
                }}
                disabled={isLoading}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center"
                title="刷新设备列表"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    刷新中...
                  </>
                ) : '刷新'}
              </button>
            </div>
          </div>

          {/* 录音参数设置 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                采样率
              </label>
              <select
                value={sampleRate}
                onChange={(e) => setSampleRate(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={44100}>44.1 kHz (CD质量)</option>
                <option value={48000}>48 kHz (专业)</option>
                <option value={96000}>96 kHz (高清)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                声道
              </label>
              <select
                value={channels}
                onChange={(e) => setChannels(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>单声道</option>
                <option value={2}>立体声</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                位深度
              </label>
              <select
                value={bitDepth}
                onChange={(e) => setBitDepth(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={16}>16位</option>
                <option value={24}>24位</option>
                <option value={32}>32位</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                输出格式
              </label>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as any)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="wav">WAV (无损)</option>
                <option value="flac">FLAC (无损压缩)</option>
                <option value="mp3">MP3 (有损压缩)</option>
              </select>
            </div>
          </div>

          {/* 保存位置 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              保存位置
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-gray-50"
                placeholder="选择保存位置"
                readOnly
              />
              <button
                onClick={handleSelectOutputDirectory}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                选择文件夹
              </button>
            </div>
          </div>

          {/* 质量提示 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <SettingsIcon className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-blue-900">当前设置</h4>
                <p className="text-sm text-blue-700 mt-1">
                  {sampleRate/1000}kHz / {channels === 1 ? '单声道' : '立体声'} / {bitDepth}位 / {outputFormat.toUpperCase()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleStartRecording}
            disabled={!selectedDevice || !outputPath || isLoading || isStarting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center space-x-2"
          >
            <PlayIcon className="w-4 h-4" />
            <span>{isStarting ? '正在启动...' : '开始录音'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

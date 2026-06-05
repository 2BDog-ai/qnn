import React, { useState, useEffect, useRef } from 'react';
import { MicrophoneIcon, StopIcon, ClockIcon } from './icons/AudioIcons';

interface ConsoleRecordingControlProps {
  onStartRecording: (options: any) => void;
  isGlobalRecording?: boolean;
  isRecordingStarting?: boolean;
  globalRecordingTime?: number;
  globalRecordingPath?: string;
  onGlobalStopRecording?: () => void;
}

export const ConsoleRecordingControl: React.FC<ConsoleRecordingControlProps> = ({
  onStartRecording,
  isGlobalRecording = false,
  isRecordingStarting = false,
  globalRecordingTime = 0,
  globalRecordingPath = '',
  onGlobalStopRecording
}) => {
  // 使用全局录音状态，不再需要本地状态
  const isRecording = isGlobalRecording;
  const recordingTime = globalRecordingTime;
  const recordingPath = globalRecordingPath;

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  };

  const handleStartClick = () => {
    onStartRecording({});
  };

  const handleStopRecording = () => {
    if (onGlobalStopRecording) {
      onGlobalStopRecording();
    }
  };

  // 不再需要本地事件监听，使用全局录音状态

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <MicrophoneIcon className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">控台录音</h3>
        </div>
        {recordingTime > 0 && !isRecording && (
          <div className="text-sm text-gray-500">
            录音时长: {formatTime(recordingTime)}
          </div>
        )}
      </div>

      {/* 录音状态 */}
      {isRecording ? (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="animate-pulse">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              </div>
              <span className="text-sm font-medium text-red-900">正在录音</span>
            </div>
            <div className="flex items-center space-x-2">
              <ClockIcon className="w-4 h-4 text-red-600" />
              <span className="text-sm text-red-700 font-mono">{formatTime(recordingTime)}</span>
            </div>
          </div>
          
          {recordingPath && (
            <p className="text-xs text-red-700 mb-3">
              保存到: {recordingPath}
            </p>
          )}

          <button
            onClick={handleStopRecording}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            <StopIcon className="w-4 h-4" />
            <span>停止录音</span>
          </button>
        </div>
      ) : isRecordingStarting ? (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-blue-900">正在启动录音...</span>
          </div>
          {recordingPath && (
            <p className="text-xs text-blue-700 mt-3">
              保存到: {recordingPath}
            </p>
          )}
        </div>
      ) : (
        <div className="mb-6">
          {recordingPath && recordingTime > 0 ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
              <div className="flex items-start space-x-3">
                <MicrophoneIcon className="w-5 h-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-green-900">录音完成</h4>
                  <p className="text-sm text-green-700 mt-1">
                    录音时长: {formatTime(recordingTime)}
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    文件: {recordingPath}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <MicrophoneIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg mb-2">准备录音</p>
              <p className="text-sm">点击下方按钮配置录音参数并开始</p>
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      {!isRecording && (
        <div className="text-center">
          <button
            onClick={handleStartClick}
            disabled={isRecordingStarting}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors font-medium"
          >
            {isRecordingStarting ? '正在启动...' : '配置并开始录音'}
          </button>
        </div>
      )}
    </div>
  );
};

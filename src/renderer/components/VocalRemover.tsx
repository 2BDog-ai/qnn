import React, { useEffect, useState } from 'react';
import {
  ConvertIcon,
  DeleteIcon,
  FileIcon,
  LoadingIcon,
  VolumeHighIcon
} from './icons/AudioIcons';

interface ElectronFile {
  name: string;
  path: string;
  size?: number;
  type?: string;
  lastModified?: number;
}

export const VocalRemover: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<ElectronFile[]>([]);
  const [outputDirectory, setOutputDirectory] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [processingResults, setProcessingResults] = useState<any[]>([]);

  useEffect(() => {
    const initOutputDirectory = async () => {
      try {
        if (window.electronAPI?.app?.getDesktopPath) {
          const desktopPath = await window.electronAPI.app.getDesktopPath();
          if (desktopPath) {
            setOutputDirectory(desktopPath);
            return;
          }
        }

        if (window.electronAPI?.vocalRemover?.getDefaultPaths) {
          const paths = await window.electronAPI.vocalRemover.getDefaultPaths();
          if (paths?.output) {
            setOutputDirectory(paths.output);
          }
        }
      } catch (error) {
        console.warn('Failed to initialize vocal remover output directory:', error);
      }
    };

    initOutputDirectory();

    if (window.electronAPI?.vocalRemover?.onProgress) {
      const unsubscribe = window.electronAPI.vocalRemover.onProgress((data: any) => {
        if (data.status === 'processing') {
          setProgress(data.progress);
          setStatus(data.message || '处理中...');
        } else if (data.status === 'completed') {
          setProgress(100);
          setStatus('处理完成');
          setIsProcessing(false);
        } else if (data.status === 'cancelled') {
          setStatus('处理已取消');
          setIsProcessing(false);
        }
      });

      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, []);

  const handleSelectInputFile = async () => {
    try {
      if (window.electronAPI?.vocalRemover?.selectInputFile) {
        const result = await window.electronAPI.vocalRemover.selectInputFile();
        if (result?.success && result.path) {
          setSelectedFiles([{
            name: result.path.split(/[\\/]/).pop() || result.path,
            path: result.path
          }]);
        }
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.multiple = false;
      input.onchange = (event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        setSelectedFiles([{
          name: file.name,
          path: URL.createObjectURL(file),
          size: file.size,
          type: file.type,
          lastModified: file.lastModified
        }]);
      };
      input.click();
    } catch (error) {
      console.error('Select input file failed:', error);
      alert('选择文件失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleSelectOutputDirectory = async () => {
    try {
      if (window.electronAPI?.vocalRemover?.selectOutputDir) {
        const result = await window.electronAPI.vocalRemover.selectOutputDir();
        if (result?.success && result.path) {
          setOutputDirectory(result.path);
        }
        return;
      }

      const dirPath = prompt('请输入输出目录路径:', outputDirectory);
      if (dirPath) setOutputDirectory(dirPath);
    } catch (error) {
      console.error('Select output directory failed:', error);
      const dirPath = prompt('选择目录失败，请输入输出目录路径:', outputDirectory);
      if (dirPath) setOutputDirectory(dirPath);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
    setProcessingResults([]);
    setStatus('');
    setProgress(0);
  };

  const handleStartProcessing = async () => {
    if (selectedFiles.length === 0) {
      alert('请先选择要处理的音频文件');
      return;
    }

    if (!outputDirectory) {
      alert('请选择输出目录');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setStatus('开始处理...');
    setProcessingResults([]);

    try {
      const file = selectedFiles[0];
      const inputPath = file.path || file.name;
      const baseName = (file.name || 'output').split(/[\\/]/).pop() || 'output';
      const nameWithoutExt = baseName.replace(/\.[^/.]+$/, '');
      const outputFileName = `${nameWithoutExt}_no_vocal.mp3`;

      const result = await window.electronAPI.vocalRemover.process({
        inputPath,
        outputPath: outputDirectory,
        outputFileName,
        algorithm: 'karaoke',
        quality: 'high',
        preserveBass: true,
        preserveHighs: true
      });

      if (result?.success) {
        setProcessingResults([{
          success: true,
          outputPath: result.outputPath,
          duration: result.duration
        }]);
        setStatus('处理完成');
        setProgress(100);
        alert(`处理成功:\n${result.outputPath}`);
      } else {
        setProcessingResults([{
          success: false,
          error: result?.error || '处理失败'
        }]);
        setStatus('处理失败: ' + (result?.error || '未知错误'));
        alert('处理失败: ' + (result?.error || '未知错误') + '\n详情: ' + (result?.details || '无'));
      }
    } catch (error) {
      console.error('Vocal removal failed:', error);
      setStatus('处理失败: ' + (error instanceof Error ? error.message : '未知错误'));
      alert('处理失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelProcessing = async () => {
    try {
      await window.electronAPI.vocalRemover.cancel();
      setStatus('处理已取消');
    } catch (error) {
      console.error('Cancel vocal removal failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <VolumeHighIcon className="w-6 h-6 text-purple-600 mr-3" />
                人声消除
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                使用固定的人声削弱方式，尽量保留伴奏和音乐细节。
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900">选择音频文件</h3>

            <div className="flex space-x-4">
              <button
                onClick={handleSelectInputFile}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                <FileIcon className="w-5 h-5" />
                <span>选择文件</span>
              </button>

              <button
                onClick={handleClearFiles}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={selectedFiles.length === 0}
              >
                清空列表
              </button>
            </div>

            {selectedFiles.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">已选择的文件 ({selectedFiles.length})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedFiles.map((file, index) => (
                    <div key={`${file.path}-${index}`} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                      <button
                        onClick={() => handleRemoveFile(index)}
                        className="text-red-500 hover:text-red-700 ml-2"
                      >
                        <DeleteIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900">输出设置</h3>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">输出目录:</span>
              <input
                type="text"
                value={outputDirectory}
                onChange={(event) => setOutputDirectory(event.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="默认输出到桌面"
              />
              <button
                onClick={handleSelectOutputDirectory}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                另存为
              </button>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleStartProcessing}
                disabled={isProcessing || selectedFiles.length === 0}
                className="flex items-center space-x-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <LoadingIcon className="w-5 h-5 animate-spin" />
                ) : (
                  <ConvertIcon className="w-5 h-5" />
                )}
                <span>{isProcessing ? '处理中...' : '开始处理'}</span>
              </button>

              {isProcessing && (
                <button
                  onClick={handleCancelProcessing}
                  className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  取消处理
                </button>
              )}
            </div>

            {(isProcessing || status) && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{status}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {processingResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">处理结果</h3>
              <div className="border border-gray-200 rounded-lg p-4">
                {processingResults.map((result, index) => (
                  <div key={index} className={result.success ? 'text-green-700' : 'text-red-700'}>
                    {result.success ? `成功: ${result.outputPath}` : `失败: ${result.error}`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

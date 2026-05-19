import React, { useState, useRef, useCallback } from 'react';
import {
  CloudUploadIcon as UploadIcon,
  FolderIcon,
  MusicIcon as MusicNoteIcon,
  CheckCircleIcon,
  XCircleIcon,
  LoadingIcon
} from './icons/AudioIcons';

interface ImprovedFileImportProps {
  onImportFiles: (files: File[]) => Promise<void>;
  onImportFolder: (folderPath: string) => Promise<void>;
  onClose?: () => void;
}

interface ImportedFile {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

export const ImprovedFileImport: React.FC<ImprovedFileImportProps> = ({
  onImportFiles,
  onImportFolder,
  onClose
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // 支持的音频格式
  const supportedFormats = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'];
  
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    const files: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && isAudioFile(file.name)) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      await processFiles(files);
    }
  }, []);

  const isAudioFile = (filename: string): boolean => {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return supportedFormats.includes(ext);
  };

  const processFiles = async (files: File[]) => {
    setIsProcessing(true);
    
    // 创建文件列表
    const fileList: ImportedFile[] = files.map(file => ({
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      size: file.size,
      status: 'pending' as const
    }));
    
    setImportedFiles(fileList);
    
    try {
      // 一次性导入所有文件
      await onImportFiles(files);
      
      // 将所有文件状态更新为成功
      setImportedFiles(prev => prev.map(f => ({ ...f, status: 'success' as const })));
      setProgress(100);
    } catch (error) {
      // 将所有文件状态更新为错误
      setImportedFiles(prev => prev.map(f => ({ 
        ...f, 
        status: 'error' as const,
        error: error instanceof Error ? error.message : '导入失败'
      })));
    }
    
    setIsProcessing(false);
  };

  const handleFileSelect = async () => {
    try {
      // 使用 Electron 原生文件对话框获取文件路径
      const filePaths = await window.electronAPI.dialog.openFile({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });
      
      if (Array.isArray(filePaths) && filePaths.length > 0) {
        console.log('选择的文件路径:', filePaths);
        
        // 创建包含完整路径的 File 对象
        const filesWithPaths = await Promise.all(
          filePaths.map(async (filePath: string) => {
            const fileName = filePath.split(/[\\/]/).pop() || 'unknown';
            let fileSize = 0;
            
            try {
              // 获取文件大小
              if (window.electronAPI?.fs?.stat) {
                const stats = await window.electronAPI.fs.stat(filePath);
                fileSize = stats.size || 0;
              }
            } catch (error) {
              console.warn(`无法获取文件大小: ${filePath}`, error);
            }
            
            // 创建扩展的 File 对象，包含 path 属性
            const fileWithPath = new File([], fileName, { 
              type: `audio/${fileName.split('.').pop()?.toLowerCase() || 'unknown'}` 
            });
            
            // 添加 path 属性
            Object.defineProperty(fileWithPath, 'path', {
              value: filePath,
              writable: false,
              enumerable: true
            });
            
            // 添加 size 属性
            Object.defineProperty(fileWithPath, 'size', {
              value: fileSize,
              writable: false,
              enumerable: true
            });
            
            return fileWithPath;
          })
        );
        
        console.log('处理后的文件对象:', filesWithPaths);
        await processFiles(filesWithPaths);
      }
    } catch (error) {
      console.error('文件选择失败:', error);
    }
  };

  const handleFolderSelect = async () => {
    try {
      // 使用 Electron 原生文件夹对话框
      const folderPath = await window.electronAPI.dialog.openFolder({
        title: '选择音乐文件夹'
      });
      
      if (folderPath) {
        console.log('选择的文件夹路径:', folderPath);
        
        // 调用父组件的文件夹导入方法
        await onImportFolder(folderPath);
      }
    } catch (error) {
      console.error('文件夹选择失败:', error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  const getSuccessCount = () => importedFiles.filter(f => f.status === 'success').length;
  const getErrorCount = () => importedFiles.filter(f => f.status === 'error').length;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* 头部 */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <UploadIcon className="w-6 h-6" />
              <h2 className="text-xl font-bold">导入音乐</h2>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white transition-colors"
              >
                <XCircleIcon className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        {/* 内容区域 */}
        <div className="p-6">
          {/* 拖拽区域 */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              isDragging 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center">
              <div className={`mb-4 ${isDragging ? 'animate-bounce' : ''}`}>
                <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
                  <UploadIcon className="w-10 h-10 text-blue-600" />
                </div>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {isDragging ? '释放以导入文件' : '拖拽音频文件到这里'}
              </h3>
              
              <p className="text-sm text-gray-500 mb-4">
                或者选择以下方式导入
              </p>
              
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleFileSelect}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MusicNoteIcon className="w-4 h-4" />
                  <span>选择文件</span>
                </button>
                
                <button
                  onClick={handleFolderSelect}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FolderIcon className="w-4 h-4" />
                  <span>选择文件夹</span>
                </button>
              </div>
              
            </div>
          </div>

          {/* 支持的格式说明 */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              支持的格式：MP3, WAV, FLAC, AAC, OGG, M4A, WMA
            </p>
          </div>

          {/* 导入进度 */}
          {importedFiles.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">导入进度</h4>
                <div className="flex items-center space-x-4 text-sm">
                  <span className="text-green-600">
                    成功: {getSuccessCount()}
                  </span>
                  <span className="text-red-600">
                    失败: {getErrorCount()}
                  </span>
                  <span className="text-gray-600">
                    总计: {importedFiles.length}
                  </span>
                </div>
              </div>

              {/* 进度条 */}
              {isProcessing && (
                <div className="mb-4">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {Math.round(progress)}% 完成
                  </p>
                </div>
              )}

              {/* 文件列表 */}
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                {importedFiles.map(file => (
                  <div 
                    key={file.id}
                    className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-3 flex-1">
                      <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                        <MusicNoteIcon className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="ml-4">
                      {file.status === 'pending' && (
                        <span className="text-sm text-gray-400">等待中</span>
                      )}
                      {file.status === 'processing' && (
                        <LoadingIcon className="w-5 h-5 text-blue-600 animate-spin" />
                      )}
                      {file.status === 'success' && (
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                      )}
                      {file.status === 'error' && (
                        <div className="flex items-center space-x-1">
                          <XCircleIcon className="w-5 h-5 text-red-600" />
                          <span className="text-xs text-red-600">{file.error}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        {importedFiles.length > 0 && !isProcessing && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                导入完成！成功导入 {getSuccessCount()} 个文件
              </p>
              <button
                onClick={() => {
                  setImportedFiles([]);
                  setProgress(0);
                  onClose?.();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
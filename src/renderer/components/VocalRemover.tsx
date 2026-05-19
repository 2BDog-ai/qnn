import React, { useState, useEffect, useRef } from 'react';
import { 
  ConvertIcon, 
  FileIcon, 
  FolderIcon, 
  DeleteIcon, 
  LoadingIcon, 
  VolumeHighIcon 
} from './icons/AudioIcons';



interface VocalRemovalOptions {
  algorithm: 'karaoke' | 'bandpass' | 'phase' | 'highpass' | 'spectral' | 'wiener' | 'bss' | 'hpss' | 'multistage' | 'spectral_gating';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  preserveBass: boolean;
  preserveHighs: boolean;
  spectralThreshold: number;
  wienerNoiseLevel: number;
  bssIterations: number;
  hpssKernelSize: number;
  multistageLevels: number;
  spectralGatingSensitivity: number;
}

// 自定义文件接口，支持Electron的文件路径
interface ElectronFile {
  name: string;
  path: string;
  size?: number;
  type?: string;
  lastModified?: number;
}

interface AlgorithmInfo {
  name: string;
  description: string;
  complexity: string;
  quality: string;
}

export const VocalRemover: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<ElectronFile[]>([]);
  const [outputDirectory, setOutputDirectory] = useState('');  // 初始为空，稍后动态获取桌面路径
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [processingResults, setProcessingResults] = useState<any[]>([]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
  // 默认算法列表 - 仅保留卡拉OK模式
  const [algorithms] = useState<Record<string, AlgorithmInfo>>({
    karaoke: {
      name: '卡拉OK模式',
      description: '基于立体声相位消除，适合大多数流行音乐',
      complexity: 'medium',
      quality: 'high'
    }
  });
  
  const [vocalRemovalOptions, setVocalRemovalOptions] = useState<VocalRemovalOptions>({
    algorithm: 'karaoke',
    quality: 'high',
    preserveBass: true,
    preserveHighs: true,
    spectralThreshold: 0.3,
    wienerNoiseLevel: 0.1,
    bssIterations: 100,
    hpssKernelSize: 31,
    multistageLevels: 3,
    spectralGatingSensitivity: 0.1
  });

  // 监听处理进度
  useEffect(() => {
    // 初始化默认输出目录为桌面
    const initOutputDirectory = async () => {
      try {
        if (window.electronAPI?.app?.getDesktopPath) {
          const desktopPath = await window.electronAPI.app.getDesktopPath();
          if (desktopPath) {
            setOutputDirectory(desktopPath);
            console.log('设置默认输出目录为桌面:', desktopPath);
            return;
          }
        }
        if (window.electronAPI?.vocalRemover?.getDefaultPaths) {
          const paths = await window.electronAPI.vocalRemover.getDefaultPaths();
          if (paths && paths.output) {
            setOutputDirectory(paths.output);
            console.log('设置默认输出目录:', paths.output);
          }
        }
      } catch (error) {
        console.warn('获取默认输出路径失败:', error);
        setOutputDirectory('');
      }
    };
    
    initOutputDirectory();
    
    if (window.electronAPI?.vocalRemover?.onProgress) {
      const unsubscribe = window.electronAPI.vocalRemover.onProgress((data: any) => {
        if (data.status === 'processing') {
          setProgress(data.progress);
          setStatus(data.message);
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
        if (unsubscribe) {
          unsubscribe();
        }
      };
    }
  }, []);

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
  };

  // 使用vocalRemover API选择文件
  const handleSelectInputFile = async () => {
    try {
      // 检查是否在Electron环境中
      if (window.electronAPI?.vocalRemover?.selectInputFile) {
        console.log('使用Electron API选择文件...');
        const result = await window.electronAPI.vocalRemover.selectInputFile();
        
        if (result && result.success && result.path) {
          // 创建一个临时ElectronFile对象
          const tempFile: ElectronFile = {
            name: result.path.split('/').pop() || '',
            path: result.path
          };
          setSelectedFiles([tempFile]);
          console.log('文件选择成功:', tempFile);
        } else {
          console.log('用户取消了文件选择或选择失败:', result?.error);
        }
      } else {
        // 浏览器环境，使用HTML5文件选择器
        console.log('使用浏览器文件选择器...');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.multiple = false;
        
        input.onchange = (event) => {
          const target = event.target as HTMLInputElement;
          if (target.files && target.files.length > 0) {
            const file = target.files[0];
            // 创建浏览器兼容的ElectronFile对象
            const tempFile: ElectronFile = {
              name: file.name,
              path: URL.createObjectURL(file), // 使用blob URL
              size: file.size,
              type: file.type,
              lastModified: file.lastModified
            };
            setSelectedFiles([tempFile]);
            console.log('浏览器文件选择成功:', tempFile);
          }
        };
        
        input.click();
      }
    } catch (error) {
      console.error('选择输入文件失败:', error);
      alert('选择文件失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  // 选择输出目录
  const handleSelectOutputDirectory = async () => {
    console.log('=== 开始选择输出目录 ===');
    
    try {
      if (window.electronAPI?.vocalRemover?.selectOutputDir) {
        console.log('调用vocalRemover.selectOutputDir...');
        const result = await window.electronAPI.vocalRemover.selectOutputDir();
        console.log('selectOutputDir结果:', result);
        
        if (result && result.success && result.path) {
          setOutputDirectory(result.path);
          console.log('设置输出目录成功:', result.path);
        } else {
          console.log('用户取消了目录选择或选择失败:', result?.error);
        }
      } else if (window.electronAPI?.system?.openFolder) {
        // 尝试使用系统API
        console.log('使用系统API选择目录...');
        const result = await window.electronAPI.system.openFolder();
        if (result && result.filePaths && result.filePaths.length > 0) {
          setOutputDirectory(result.filePaths[0]);
          console.log('设置输出目录成功:', result.filePaths[0]);
        }
      } else {
        // 浏览器环境，提示手动输入
        console.log('使用手动输入目录...');
        const dirPath = prompt('请输入输出目录路径:', outputDirectory);
        if (dirPath) {
          setOutputDirectory(dirPath);
          console.log('设置输出目录成功:', dirPath);
        }
      }
    } catch (error) {
      console.error('选择输出目录失败:', error);
      // 浏览器环境，提示手动输入
      const dirPath = prompt('选择目录失败，请输入输出目录路径:', outputDirectory);
      if (dirPath) {
        setOutputDirectory(dirPath);
        console.log('手动设置输出目录成功:', dirPath);
      }
    }
  };

  // 开始处理（单个文件）
  const handleStartProcessing = async () => {
    console.log('=== 前端：开始处理人声消除 ===');
    
    if (selectedFiles.length === 0) {
      alert('请先选择要处理的文件');
      return;
    }

    if (!outputDirectory) {
      alert('请选择输出目录');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setStatus('开始处理...');

    try {
      const file = selectedFiles[0];
      console.log('处理文件对象:', file);
      
      // 获取输入文件路径
      const inputPath = file.path || file.name;
      console.log('输入文件路径:', inputPath);
      
      // 构建输出文件名（只要文件名，不要路径）
      const baseName = file.name.split(/[\\\/]/).pop() || 'output';  // 提取文件名
      const nameWithoutExt = baseName.replace(/\.[^/.]+$/, '');  // 去掉扩展名
      const outputExt = vocalRemovalOptions.algorithm === 'karaoke' ? 'mp3' : 'wav';
      const outputFileName = `${nameWithoutExt}_no_vocal.${outputExt}`;
      
      console.log('文件名处理:');
      console.log('  原始file.name:', file.name);
      console.log('  提取的baseName:', baseName);
      console.log('  去扩展名:', nameWithoutExt);
      console.log('  输出文件名:', outputFileName);
      console.log('  输出目录:', outputDirectory);
      
      // 构建处理选项
      const processOptions = {
        inputPath: inputPath,
        outputPath: outputDirectory,  // 只传目录
        outputFileName: outputFileName,  // 只传文件名
        algorithm: vocalRemovalOptions.algorithm,
        quality: vocalRemovalOptions.quality,
        preserveBass: vocalRemovalOptions.preserveBass,
        preserveHighs: vocalRemovalOptions.preserveHighs,
        spectralThreshold: vocalRemovalOptions.spectralThreshold,
        wienerNoiseLevel: vocalRemovalOptions.wienerNoiseLevel,
        bssIterations: vocalRemovalOptions.bssIterations,
        hpssKernelSize: vocalRemovalOptions.hpssKernelSize,
        multistageLevels: vocalRemovalOptions.multistageLevels,
        spectralGatingSensitivity: vocalRemovalOptions.spectralGatingSensitivity
      };

      console.log('发送到后端的参数:', JSON.stringify(processOptions, null, 2));
      
      // 检查API
      if (!window.electronAPI?.vocalRemover?.process) {
        throw new Error('vocalRemover.process API不存在');
      }

      // 调用处理
      const result = await window.electronAPI.vocalRemover.process(processOptions);
      console.log('后端返回结果:', result);

      if (result && result.success) {
        setProcessingResults([{
          success: true,
          outputPath: result.outputPath,
          duration: result.duration
        }]);
        setStatus('处理完成！');
        alert(`处理成功！\n输出文件: ${result.outputPath}`);
      } else {
        setProcessingResults([{
          success: false,
          error: result?.error || '处理失败'
        }]);
        setStatus('处理失败: ' + (result?.error || '未知错误'));
        alert('处理失败: ' + (result?.error || '未知错误') + '\n详情: ' + (result?.details || '无'));
      }
    } catch (error) {
      console.error('处理失败:', error);
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
      console.error('取消处理失败:', error);
    }
  };

  const getAlgorithmDescription = (algorithm: string) => {
    const alg = algorithms[algorithm];
    if (!alg) return '';
    
    const complexityMap = {
      'low': '低复杂度',
      'medium': '中等复杂度', 
      'high': '高复杂度',
      'ultra': '超高复杂度'
    };
    
    const qualityMap = {
      'low': '低质量',
      'medium': '中等质量',
      'high': '高质量', 
      'ultra': '超高质量'
    };
    
    return `${alg.description} (${complexityMap[alg.complexity as keyof typeof complexityMap] || alg.complexity}, ${qualityMap[alg.quality as keyof typeof qualityMap] || alg.quality})`;
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* 标题区域 */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <VolumeHighIcon className="w-6 h-6 text-purple-600 mr-3" />
                人声消除
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                使用高级算法消除音频中的人声，保留音乐伴奏
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* 文件选择区域 */}
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
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                disabled={selectedFiles.length === 0}
              >
                清空列表
              </button>
            </div>

            {/* 文件列表 */}
            {selectedFiles.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">已选择的文件 ({selectedFiles.length})</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
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

          {/* 算法选择区域 */}
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900">选择人声消除算法</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(algorithms).map(([key, algorithm]) => (
                <div
                  key={key}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    vocalRemovalOptions.algorithm === key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setVocalRemovalOptions(prev => ({ ...prev, algorithm: key as any }))}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{algorithm.name}</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {getAlgorithmDescription(key)}
                      </p>
                    </div>
                    <div className="ml-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        algorithm.complexity === 'ultra' ? 'bg-purple-100 text-purple-800' :
                        algorithm.complexity === 'high' ? 'bg-red-100 text-red-800' :
                        algorithm.complexity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {algorithm.complexity === 'ultra' ? '超高' :
                         algorithm.complexity === 'high' ? '高' :
                         algorithm.complexity === 'medium' ? '中' : '低'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 质量设置 */}
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900">质量设置</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['low', 'medium', 'high', 'ultra'].map((quality) => (
                <button
                  key={quality}
                  onClick={() => setVocalRemovalOptions(prev => ({ ...prev, quality: quality as any }))}
                  className={`p-3 border rounded-lg transition-all ${
                    vocalRemovalOptions.quality === quality
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="font-medium capitalize">{quality}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {quality === 'low' ? '快速处理' :
                       quality === 'medium' ? '平衡效果' :
                       quality === 'high' ? '高质量' : '最佳效果'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 高级选项 */}
          <div className="space-y-4 mb-6">
            <button
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
            >
              <span className="font-medium">
                {showAdvancedOptions ? '隐藏' : '显示'} 高级参数设置
              </span>
              <span className="text-sm">▼</span>
            </button>

            {showAdvancedOptions && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-gray-50 rounded-lg">
                {/* 谱减法参数 */}
                {vocalRemovalOptions.algorithm === 'spectral' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      谱减法阈值: {vocalRemovalOptions.spectralThreshold}
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="0.8"
                      step="0.05"
                      value={vocalRemovalOptions.spectralThreshold}
                      onChange={(e) => setVocalRemovalOptions(prev => ({ 
                        ...prev, 
                        spectralThreshold: parseFloat(e.target.value) 
                      }))}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      较低值保留更多细节，较高值消除更多人声
                    </div>
                  </div>
                )}

                {/* 维纳滤波参数 */}
                {vocalRemovalOptions.algorithm === 'wiener' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      噪声水平: {vocalRemovalOptions.wienerNoiseLevel}
                    </label>
                    <input
                      type="range"
                      min="0.05"
                      max="0.3"
                      step="0.01"
                      value={vocalRemovalOptions.wienerNoiseLevel}
                      onChange={(e) => setVocalRemovalOptions(prev => ({ 
                        ...prev, 
                        wienerNoiseLevel: parseFloat(e.target.value) 
                      }))}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      较低值更激进，较高值更保守
                    </div>
                  </div>
                )}

                {/* 盲源分离参数 */}
                {vocalRemovalOptions.algorithm === 'bss' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      迭代次数: {vocalRemovalOptions.bssIterations}
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="200"
                      step="10"
                      value={vocalRemovalOptions.bssIterations}
                      onChange={(e) => setVocalRemovalOptions(prev => ({ 
                        ...prev, 
                        bssIterations: parseInt(e.target.value) 
                      }))}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      更多迭代 = 更好效果，但处理时间更长
                    </div>
                  </div>
                )}

                {/* HPSS参数 */}
                {vocalRemovalOptions.algorithm === 'hpss' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      核大小: {vocalRemovalOptions.hpssKernelSize}
                    </label>
                    <input
                      type="range"
                      min="15"
                      max="63"
                      step="2"
                      value={vocalRemovalOptions.hpssKernelSize}
                      onChange={(e) => setVocalRemovalOptions(prev => ({ 
                        ...prev, 
                        hpssKernelSize: parseInt(e.target.value) 
                      }))}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      较大核 = 更平滑分离，较小核 = 更精确分离
                    </div>
                  </div>
                )}

                {/* 多级处理参数 */}
                {vocalRemovalOptions.algorithm === 'multistage' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      处理层数: {vocalRemovalOptions.multistageLevels}
                    </label>
                    <input
                      type="range"
                      min="2"
                      max="5"
                      step="1"
                      value={vocalRemovalOptions.multistageLevels}
                      onChange={(e) => setVocalRemovalOptions(prev => ({ 
                        ...prev, 
                        multistageLevels: parseInt(e.target.value) 
                      }))}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      更多层数 = 更好效果，但处理时间更长
                    </div>
                  </div>
                )}

                {/* 频谱门控参数 */}
                {vocalRemovalOptions.algorithm === 'spectral_gating' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      敏感度: {vocalRemovalOptions.spectralGatingSensitivity}
                    </label>
                    <input
                      type="range"
                      min="0.05"
                      max="0.3"
                      step="0.01"
                      value={vocalRemovalOptions.spectralGatingSensitivity}
                      onChange={(e) => setVocalRemovalOptions(prev => ({ 
                        ...prev, 
                        spectralGatingSensitivity: parseFloat(e.target.value) 
                      }))}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      较低值更敏感，较高值更保守
                    </div>
                  </div>
                )}

                {/* 通用选项 */}
                <div className="col-span-full space-y-3">
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={vocalRemovalOptions.preserveBass}
                        onChange={(e) => setVocalRemovalOptions(prev => ({ 
                          ...prev, 
                          preserveBass: e.target.checked 
                        }))}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">保护低音</span>
                    </label>
                    
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={vocalRemovalOptions.preserveHighs}
                        onChange={(e) => setVocalRemovalOptions(prev => ({ 
                          ...prev, 
                          preserveHighs: e.target.checked 
                        }))}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">保护高音</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 输出设置 */}
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-medium text-gray-900">输出设置</h3>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">输出目录:</span>
              <input
                type="text"
                value={outputDirectory}
                onChange={(e) => setOutputDirectory(e.target.value)}
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

          {/* 处理控制 */}
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

            {/* 进度显示 */}
            {isProcessing && (
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

          {/* 处理结果 */}
          {processingResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">处理结果</h3>
              
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {processingResults.filter(r => r.success).length}
                    </div>
                    <div className="text-sm text-green-700">成功</div>
                  </div>
                  
                  <div className="p-3 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {processingResults.filter(r => !r.success).length}
                    </div>
                    <div className="text-sm text-red-700">失败</div>
                  </div>
                  
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {processingResults.length}
                    </div>
                    <div className="text-sm text-blue-700">总计</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

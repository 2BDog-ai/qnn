import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CutIcon, MusicIcon, PauseIcon, PlayIcon, SaveIcon, VolumeIcon } from './icons/AudioIcons';

interface AudioFile {
  path: string;
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  format: string;
}

interface Selection {
  start: number;
  end: number;
}

interface AudioEditorProps {
  musicId?: string;
  sourcePlaylistId?: string;
}

type WaveformStatus = 'idle' | 'loading' | 'ready' | 'fallback' | 'error';

const SUPPORTED_FORMATS = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'opus'];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatTimeForFile = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, '0')}_${secs.toString().padStart(2, '0')}`;
};

const filePathToFileURL = (filePath: string): string => {
  if (!filePath) return '';
  if (filePath.startsWith('blob:') || filePath.startsWith('file:')) return filePath;

  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');

  if (/^[A-Za-z]:/.test(normalizedPath)) {
    const drive = segments[0];
    const rest = segments.slice(1).map((segment) => encodeURIComponent(segment)).join('/');
    return `file:///${drive}/${rest}`;
  }

  const encoded = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return `file://${normalizedPath.startsWith('/') ? '' : '/'}${encoded}`;
};

const getFileName = (filePath: string) => filePath.split(/[/\\]/).pop() || '未知音频';

const getExtension = (filePath: string) => {
  const name = getFileName(filePath);
  const ext = name.includes('.') ? name.split('.').pop() : '';
  return (ext || '').toLowerCase();
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const safeNumber = (value: unknown, fallback = 0) => {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
};

const normalizeLocalPath = (filePath: string) => {
  let normalized = filePath.replace(/\\/g, '/');
  if (/^[A-Za-z]:(?!\/)/.test(normalized)) {
    normalized = `${normalized.slice(0, 2)}/${normalized.slice(2)}`;
  }
  return normalized;
};

export const AudioEditor: React.FC<AudioEditorProps> = ({ musicId, sourcePlaylistId }) => {
  const [audioFile, setAudioFile] = useState<AudioFile | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [waveformStatus, setWaveformStatus] = useState<WaveformStatus>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState(0);
  const [isProgressDragging, setIsProgressDragging] = useState(false);
  const [volume, setVolume] = useState(1);
  const [startMinInput, setStartMinInput] = useState('');
  const [startSecInput, setStartSecInput] = useState('');
  const [endMinInput, setEndMinInput] = useState('');
  const [endSecInput, setEndSecInput] = useState('');
  const [timeInputError, setTimeInputError] = useState('');
  const [originalMusicId, setOriginalMusicId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const selectionPlaybackEndRef = useRef<number | null>(null);

  const selectedDuration = useMemo(() => {
    if (!selection) return 0;
    return Math.max(0, selection.end - selection.start);
  }, [selection]);

  const canTrim = Boolean(selection && selectedDuration > 0.05 && audioFile && !isLoading && !isProcessing);

  const getDuration = useCallback(() => {
    return audioFile && Number.isFinite(audioFile.duration) && audioFile.duration > 0 ? audioFile.duration : 0;
  }, [audioFile]);

  const parseInputSeconds = (min: string, sec: string): number | null => {
    const hasMin = min.trim() !== '';
    const hasSec = sec.trim() !== '';
    if (!hasMin && !hasSec) return null;

    const minutes = hasMin ? Number.parseInt(min, 10) : 0;
    const seconds = hasSec ? Number.parseInt(sec, 10) : 0;
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    if (minutes < 0 || seconds < 0 || seconds > 59) return null;

    return minutes * 60 + seconds;
  };

  const metadataDurationFromAudio = (src: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      const cleanup = () => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audio.src = '';
      };

      audio.onloadedmetadata = () => {
        const duration = safeNumber(audio.duration, 0);
        cleanup();
        resolve(duration);
      };

      audio.onerror = () => {
        cleanup();
        resolve(0);
      };

      audio.preload = 'metadata';
      audio.src = src;
      audio.load();
    });
  };

  const makeFallbackWaveform = useCallback(() => {
    return Array.from({ length: 240 }, (_, index) => {
      const wave = Math.abs(Math.sin(index * 0.19)) * 0.45 + Math.abs(Math.sin(index * 0.047)) * 0.25;
      return clamp(0.18 + wave, 0.12, 0.82);
    });
  }, []);

  const generateWaveform = async (filePath: string) => {
    setWaveformStatus('loading');
    setWaveformData([]);
    setWaveformData(makeFallbackWaveform());

    try {
      const backendWaveform = await withTimeout(window.electronAPI?.audioEditor?.getWaveform?.(filePath), 6000, null);
      if (Array.isArray(backendWaveform) && backendWaveform.length > 0) {
        setWaveformData(backendWaveform.map((value) => clamp(Number(value) || 0, 0.02, 1)));
        setWaveformStatus('ready');
        return;
      }

      setWaveformData(makeFallbackWaveform());
      setWaveformStatus('fallback');
    } catch (error) {
      console.warn('生成波形失败，使用可拖动时间轴:', error);
      setWaveformData(makeFallbackWaveform());
      setWaveformStatus('fallback');
    }
  };

  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(220, Math.floor(rect.height));

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const duration = getDuration();
    const middleY = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i += 1) {
      const x = (width * i) / 10;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(0, middleY);
    ctx.lineTo(width, middleY);
    ctx.stroke();

    if (!audioFile) {
      ctx.fillStyle = '#64748b';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('请选择一首音频开始剪辑', width / 2, middleY);
      return;
    }

    const bars = waveformData.length > 0 ? waveformData : makeFallbackWaveform();
    const step = width / bars.length;
    ctx.strokeStyle = waveformStatus === 'ready' ? '#2563eb' : '#60a5fa';
    ctx.lineWidth = Math.max(1, Math.min(3, step * 0.55));

    bars.forEach((value, index) => {
      const amplitude = Math.max(3, clamp(value, 0.02, 1) * middleY * 0.86);
      const x = index * step + step / 2;
      ctx.beginPath();
      ctx.moveTo(x, middleY - amplitude);
      ctx.lineTo(x, middleY + amplitude);
      ctx.stroke();
    });

    if (duration <= 0) {
      ctx.fillStyle = '#92400e';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('正在读取音频时长，请稍等', width / 2, 28);
      return;
    }

    if (selection) {
      const startX = clamp((selection.start / duration) * width, 0, width);
      const endX = clamp((selection.end / duration) * width, 0, width);
      const left = Math.min(startX, endX);
      const right = Math.max(startX, endX);

      ctx.fillStyle = 'rgba(37, 99, 235, 0.18)';
      ctx.fillRect(left, 0, right - left, height);

      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(left, 0);
      ctx.lineTo(left, height);
      ctx.moveTo(right, 0);
      ctx.lineTo(right, height);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#1d4ed8';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'left';
      const label = `${formatTime(selection.start)} - ${formatTime(selection.end)}  (${formatTime(selectedDuration)})`;
      ctx.fillText(label, clamp(left + 8, 8, Math.max(8, width - 190)), 28);
    }

    const playheadX = clamp((currentTime / duration) * width, 0, width);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(playheadX, 10, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [audioFile, currentTime, getDuration, makeFallbackWaveform, selectedDuration, selection, waveformData, waveformStatus]);

  useEffect(() => {
    updateCanvasSize();
    drawWaveform();

    const container = canvasContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateCanvasSize);
      return () => window.removeEventListener('resize', updateCanvasSize);
    }

    const observer = new ResizeObserver(() => {
      updateCanvasSize();
      drawWaveform();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [drawWaveform, updateCanvasSize]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  const loadSpecificAudioFile = useCallback(async (filePath: string, sourceMusic?: any) => {
    if (!filePath) return;

    const extension = getExtension(filePath);
    if (!SUPPORTED_FORMATS.includes(extension)) {
      alert(`暂不支持该格式：${extension || '未知'}\n支持格式：${SUPPORTED_FORMATS.join(', ').toUpperCase()}`);
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage('正在读取音频信息...');
      setWaveformStatus('idle');
      setWaveformData([]);
      setSelection(null);
      setCurrentTime(0);
      setTimeInputError('');
      setStartMinInput('');
      setStartSecInput('');
      setEndMinInput('');
      setEndSecInput('');
      selectionPlaybackEndRef.current = null;

      if (window.electronAPI?.fs?.exists) {
        const exists = await withTimeout(window.electronAPI.fs.exists(filePath), 2500, true);
        if (!exists) throw new Error('文件不存在或已被移动');
      }

      const fileUrl = filePathToFileURL(filePath);
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = fileUrl;
        audio.volume = volume;
        audio.load();
      }

      const [info, stat, metadataDuration] = await Promise.all([
        window.electronAPI?.audioEditor?.getInfo
          ? withTimeout(window.electronAPI.audioEditor.getInfo(filePath), 5000, null)
          : Promise.resolve(null),
        window.electronAPI?.fs?.stat
          ? withTimeout(window.electronAPI.fs.stat(filePath), 2500, null)
          : Promise.resolve(null),
        withTimeout(metadataDurationFromAudio(fileUrl), 7000, 0)
      ]);

      const knownDuration = safeNumber(sourceMusic?.duration, 0);
      const duration = safeNumber(info?.duration, 0) || metadataDuration || knownDuration;
      const fileName = getFileName(filePath);

      setAudioFile({
        path: filePath,
        name: sourceMusic?.displayName || sourceMusic?.fileName || fileName,
        duration,
        sampleRate: safeNumber(info?.sampleRate, 44100),
        channels: safeNumber(info?.channels, 2),
        format: typeof info?.format === 'string' && info.format.trim() ? info.format : extension
      });

      if (stat?.size === 0) {
        throw new Error('文件大小为 0，无法剪辑');
      }

      setLoadingMessage('');
      setIsLoading(false);
      await generateWaveform(filePath);
    } catch (error) {
      console.error('加载音频失败:', error);
      alert('加载音频失败：' + (error instanceof Error ? error.message : '未知错误'));
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [volume]);

  useEffect(() => {
    const loadFromMusicId = async () => {
      let targetMusicId = musicId;
      if (!targetMusicId) {
        const match = window.location.hash.match(/\/audio-editor\/(.+)/);
        targetMusicId = match?.[1]?.split('?')[0];
        if (targetMusicId) {
          targetMusicId = decodeURIComponent(targetMusicId);
        }
      }
      if (!targetMusicId) return;

      try {
        setIsLoading(true);
        setLoadingMessage('正在打开歌单中的音频...');
        const musicData = await window.electronAPI?.music?.get(targetMusicId);
        const audioPath = musicData?.path || musicData?.filePath;
        if (!audioPath) throw new Error('找不到这首歌的文件路径');

        setOriginalMusicId(targetMusicId);
        await loadSpecificAudioFile(audioPath, musicData);
      } catch (error) {
        console.error('打开歌单音频失败:', error);
        alert('打开歌单音频失败：' + (error instanceof Error ? error.message : '未知错误'));
      } finally {
        setIsLoading(false);
        setLoadingMessage('');
      }
    };

    loadFromMusicId();
  }, [loadSpecificAudioFile, musicId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const nextTime = safeNumber(audio.currentTime, 0);
      setCurrentTime(nextTime);

      const selectionEnd = selectionPlaybackEndRef.current;
      if (selectionEnd !== null && nextTime >= selectionEnd) {
        audio.pause();
        audio.currentTime = selection?.start ?? 0;
        setCurrentTime(selection?.start ?? 0);
        selectionPlaybackEndRef.current = null;
      }
    };

    const handleLoadedMetadata = () => {
      const duration = safeNumber(audio.duration, 0);
      if (duration > 0) {
        setAudioFile((prev) => (prev && (!prev.duration || prev.duration <= 0) ? { ...prev, duration } : prev));
      }
    };

    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handleEnded = () => {
      setIsPlaying(false);
      selectionPlaybackEndRef.current = null;
    };
    const handleError = () => {
      setIsPlaying(false);
      console.error('剪辑页音频加载失败:', audio.error, audio.src);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [selection]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const removeProgressListener = window.electronAPI?.audioEditor?.onProgress?.((data: any) => {
      if (data?.type === 'trim') {
        setProgress(clamp(Number(data.progress) || 0, 0, 100));
      }
    });
    return () => {
      if (typeof removeProgressListener === 'function') removeProgressListener();
    };
  }, []);

  const loadAudioFile = async () => {
    try {
      if (!window.electronAPI?.audioEditor?.selectFile) {
        alert('音频剪辑 API 不可用');
        return;
      }

      const filePath = await window.electronAPI.audioEditor.selectFile();
      if (!filePath) return;

      setOriginalMusicId(null);
      await loadSpecificAudioFile(filePath);
    } catch (error) {
      alert('选择音频失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const pointToTime = (clientX: number, rect: DOMRect) => {
    const duration = getDuration();
    if (duration <= 0) return 0;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return ratio * duration;
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!audioFile || !canvasRef.current) return;
    const duration = getDuration();
    if (duration <= 0) {
      setTimeInputError('音频时长还没有加载完成，请稍等后再选择剪辑区域');
      return;
    }

    event.preventDefault();
    canvasRef.current.setPointerCapture(event.pointerId);
    const rect = canvasRef.current.getBoundingClientRect();
    const time = pointToTime(event.clientX, rect);
    setIsSelecting(true);
    setSelectionStart(time);
    setSelection({ start: time, end: time });
    setTimeInputError('');
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isSelecting || !canvasRef.current) return;
    event.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const time = pointToTime(event.clientX, rect);
    setSelection({
      start: Math.min(selectionStart, time),
      end: Math.max(selectionStart, time)
    });
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isSelecting) return;
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
    setIsSelecting(false);
    setSelection((prev) => {
      if (!prev || Math.abs(prev.end - prev.start) < 0.05) return null;
      return prev;
    });
  };

  const seekTo = (clientX: number) => {
    if (!audioFile || !progressRef.current || !audioRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const duration = getDuration();
    if (duration <= 0) return;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const nextTime = ratio * duration;
    audioRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleProgressPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!progressRef.current) return;
    event.preventDefault();
    progressRef.current.setPointerCapture(event.pointerId);
    setIsProgressDragging(true);
    seekTo(event.clientX);
  };

  const handleProgressPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isProgressDragging) return;
    event.preventDefault();
    seekTo(event.clientX);
  };

  const handleProgressPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (progressRef.current?.hasPointerCapture(event.pointerId)) {
      progressRef.current.releasePointerCapture(event.pointerId);
    }
    setIsProgressDragging(false);
  };

  const togglePlayback = async () => {
    if (!audioFile || !audioRef.current) {
      alert('请先加载音频文件');
      return;
    }

    try {
      selectionPlaybackEndRef.current = null;
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.volume = volume;
        await audioRef.current.play();
      }
    } catch (error) {
      console.error('播放失败:', error);
      alert('播放失败：请检查文件是否存在，或音频格式是否被系统支持');
    }
  };

  const playSelection = async () => {
    if (!selection || !audioRef.current) {
      alert('请先拖动选择要试听的区域');
      return;
    }

    try {
      audioRef.current.pause();
      audioRef.current.currentTime = selection.start;
      audioRef.current.volume = volume;
      setCurrentTime(selection.start);
      selectionPlaybackEndRef.current = selection.end;
      await audioRef.current.play();
    } catch (error) {
      console.error('试听选区失败:', error);
      alert('试听选区失败：' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const applyTimeInput = () => {
    if (!audioFile) return;

    const duration = getDuration();
    const startSeconds = parseInputSeconds(startMinInput, startSecInput);
    const endSeconds = parseInputSeconds(endMinInput, endSecInput);
    setTimeInputError('');

    if ((startMinInput || startSecInput) && startSeconds === null) {
      setTimeInputError('开始时间格式不正确，秒数必须在 0-59 之间');
      return;
    }

    if ((endMinInput || endSecInput) && endSeconds === null) {
      setTimeInputError('结束时间格式不正确，秒数必须在 0-59 之间');
      return;
    }

    if (!startMinInput && !startSecInput && !endMinInput && !endSecInput) {
      setSelection(null);
      return;
    }

    const start = startSeconds ?? 0;
    const end = endSeconds ?? duration;

    if (duration <= 0) {
      setTimeInputError('音频时长还没有加载完成');
      return;
    }

    if (start >= end) {
      setTimeInputError('开始时间必须小于结束时间');
      return;
    }

    if (end > duration) {
      setTimeInputError(`结束时间不能超过总时长 ${formatTime(duration)}`);
      return;
    }

    setSelection({ start, end });
  };

  const getDefaultOutputName = () => {
    if (!audioFile || !selection) return 'clip.mp3';
    const baseName = audioFile.name.replace(/\.[^.]+$/, '');
    return `${baseName}_${formatTimeForFile(selection.start)}_${formatTimeForFile(selection.end)}.mp3`;
  };

  const runTrim = async (outputFile: string) => {
    if (!selection || !audioFile) throw new Error('请先选择剪辑区域');
    const result = await window.electronAPI.audioEditor.trim({
      inputFile: audioFile.path,
      outputFile,
      startTime: selection.start,
      endTime: selection.end,
      normalize: false,
      format: 'mp3'
    });

    if (!result?.success) {
      throw new Error(result?.error || '剪辑失败');
    }
  };

  const exportSelection = async () => {
    if (!canTrim || !audioFile || !selection) {
      alert('请先在波形上拖动选择要导出的区域');
      return;
    }

    try {
      const outputPath = await window.electronAPI.audioEditor.selectSaveLocation(getDefaultOutputName());
      if (!outputPath) return;

      setIsProcessing(true);
      setProgress(0);
      await runTrim(outputPath);
      alert('导出成功，文件已保存到：\n' + outputPath);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败：' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const saveClipToPlaylist = async () => {
    if (!canTrim || !audioFile || !selection || !originalMusicId) {
      alert('请先从歌单打开一首歌，并拖动选择要保存的剪辑区域');
      return;
    }

    try {
      const originalMusicData = await window.electronAPI.music.get(originalMusicId);
      const originalPath = originalMusicData?.path || originalMusicData?.filePath || audioFile.path;
      const originalDir = originalPath.replace(/[/\\][^/\\]+$/, '');
      const baseName = audioFile.name.replace(/\.[^.]+$/, '');
      const clipName = `${baseName}_clip_${formatTimeForFile(selection.start)}_${formatTimeForFile(selection.end)}_${Date.now()}.mp3`;
      const outputPath = normalizeLocalPath(`${originalDir}/${clipName}`);

      setIsProcessing(true);
      setProgress(0);
      await runTrim(outputPath);

      const outputExists = window.electronAPI?.fs?.exists
        ? await window.electronAPI.fs.exists(outputPath)
        : true;
      if (!outputExists) {
        throw new Error('剪辑文件没有生成，请重新剪辑');
      }

      const outputStat = window.electronAPI?.fs?.stat
        ? await window.electronAPI.fs.stat(outputPath)
        : null;
      if (outputStat && outputStat.size <= 0) {
        throw new Error('剪辑文件大小为 0，无法加入歌单');
      }

      const newMusicId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newDuration = selection.end - selection.start;
      await window.electronAPI.music.add({
        id: newMusicId,
        filePath: outputPath,
        fileName: clipName,
        displayName: `${baseName}（已剪辑）`,
        artist: originalMusicData?.artist || 'Unknown Artist',
        album: originalMusicData?.album || 'Unknown Album',
        duration: newDuration,
        fileSize: outputStat?.size || 0,
        format: 'mp3',
        bitrate: originalMusicData?.bitrate || 0,
        sampleRate: originalMusicData?.sampleRate || audioFile.sampleRate || 44100,
        addedTime: new Date(),
        playCount: 0,
        isFavorite: false,
        isTrimmed: true,
        customTags: [],
        thumbnailPath: null
      }, sourcePlaylistId);

      window.dispatchEvent(new CustomEvent('music-list-refresh', {
        detail: { updatedMusicId: newMusicId, action: 'added', playlistId: sourcePlaylistId }
      }));

      alert('保存成功：已把剪辑版加入当前歌单，原版音乐保留。');
      window.location.hash = '#/';
    } catch (error) {
      console.error('保存剪辑失败:', error);
      alert('保存剪辑失败：' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const duration = getDuration();
  const progressPercent = duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0;

  return (
    <div className="min-h-full h-full flex flex-col bg-gray-50">
      <div className="flex-1 max-w-7xl mx-auto w-full p-6 min-h-0">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex flex-col overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <CutIcon className="w-6 h-6 text-blue-600 flex-none" />
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-gray-900">音频剪辑</h2>
                  <p className="text-sm text-gray-500">支持 MP3、WAV、FLAC、M4A、AAC、OGG、WMA、OPUS，剪辑输出为 MP3</p>
                </div>
              </div>
              <button
                onClick={loadAudioFile}
                disabled={isLoading || isProcessing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                <MusicIcon className="w-4 h-4" />
                <span>选择音频文件</span>
              </button>
            </div>
          </div>

          {audioFile && (
            <div className="border-b border-gray-200 bg-gray-50">
              <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={togglePlayback}
                    className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    title={isPlaying ? '暂停' : '播放'}
                  >
                    {isPlaying ? <PauseIcon className="w-5 h-5 text-gray-700" /> : <PlayIcon className="w-5 h-5 text-gray-700" />}
                  </button>

                  <button
                    onClick={playSelection}
                    disabled={!selection}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 text-sm transition-colors"
                  >
                    试听选区
                  </button>

                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200">
                    <VolumeIcon className="w-4 h-4 text-gray-500" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(event) => setVolume(Number.parseFloat(event.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm text-gray-600 min-w-[3rem]">{Math.round(volume * 100)}%</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {originalMusicId && (
                    <button
                      onClick={saveClipToPlaylist}
                      disabled={!canTrim}
                      className="px-4 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 text-sm flex items-center gap-2 transition-colors"
                    >
                      <CutIcon className="w-4 h-4" />
                      <span>保存为新歌曲</span>
                    </button>
                  )}
                  <button
                    onClick={exportSelection}
                    disabled={!canTrim}
                    className="px-4 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 text-sm flex items-center gap-2 transition-colors"
                  >
                    <SaveIcon className="w-4 h-4" />
                    <span>导出选区</span>
                  </button>
                  <button
                    onClick={() => setSelection(null)}
                    disabled={!selection}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-40 text-sm transition-colors"
                  >
                    清除选区
                  </button>
                </div>
              </div>

              <div className="px-6 pb-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-700">精确时间剪辑</h3>
                    <span className="text-xs text-gray-500">总时长：{formatTime(duration)}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">开始时间</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="分"
                        value={startMinInput}
                        onChange={(event) => setStartMinInput(event.target.value)}
                        className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-gray-500">:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        step={1}
                        placeholder="秒"
                        value={startSecInput}
                        onChange={(event) => setStartSecInput(event.target.value)}
                        className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">结束时间</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="分"
                        value={endMinInput}
                        onChange={(event) => setEndMinInput(event.target.value)}
                        className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-gray-500">:</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        step={1}
                        placeholder="秒"
                        value={endSecInput}
                        onChange={(event) => setEndSecInput(event.target.value)}
                        className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <button
                      onClick={applyTimeInput}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                    >
                      应用选区
                    </button>
                    <button
                      onClick={() => {
                        setStartMinInput('');
                        setStartSecInput('');
                        setEndMinInput('');
                        setEndSecInput('');
                        setTimeInputError('');
                        setSelection(null);
                      }}
                      className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 transition-colors"
                    >
                      清空
                    </button>
                  </div>

                  {timeInputError && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                      {timeInputError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {audioFile && (
            <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-6">
                  <span className="text-gray-600">文件：<span className="font-medium text-gray-900">{audioFile.name}</span></span>
                  <span className="text-gray-600">时长：<span className="font-medium text-gray-900">{formatTime(duration)}</span></span>
                  <span className="text-gray-600">格式：<span className="font-medium text-gray-900">{audioFile.format.toUpperCase()}</span></span>
                </div>
                {selection && (
                  <div className="text-blue-700 font-medium">
                    选区：{formatTime(selection.start)} - {formatTime(selection.end)}，共 {formatTime(selectedDuration)}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 p-6 min-h-0 overflow-auto">
            <div className="space-y-3 min-h-full">
              <div
                ref={canvasContainerRef}
                className="relative bg-gray-50 rounded-lg border border-gray-200 overflow-hidden"
                style={{ minHeight: 280, height: '42vh', maxHeight: 430 }}
              >
                <canvas
                  ref={canvasRef}
                  className="w-full h-full cursor-crosshair touch-none"
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                />

                {(isLoading || isProcessing) && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                    <div className="text-center px-6">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="mt-3 text-gray-700">{isProcessing ? '正在生成剪辑文件...' : (loadingMessage || '正在加载...')}</p>
                      {isProcessing && (
                        <div className="mt-3 w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!audioFile && !isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <MusicIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-700 mb-2">开始音频剪辑</h3>
                      <p className="text-gray-500">点击右上角“选择音频文件”，或从歌单里进入剪辑</p>
                    </div>
                  </div>
                )}
              </div>

              {audioFile && (
                <>
                  <div className="bg-white rounded-lg border border-gray-200 px-4 py-2">
                    <div className="relative h-8">
                      <div className="absolute inset-0 flex justify-between items-center text-xs text-gray-500">
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                          <div key={ratio} className="flex flex-col items-center">
                            <div className="w-px h-2 bg-gray-300 mb-1"></div>
                            <span>{formatTime(duration * ratio)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-600 font-medium">播放进度</span>
                      <span className="text-blue-600 font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
                    </div>

                    <div
                      ref={progressRef}
                      className="relative h-6 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full cursor-pointer group shadow-inner touch-none"
                      onPointerDown={handleProgressPointerDown}
                      onPointerMove={handleProgressPointerMove}
                      onPointerUp={handleProgressPointerUp}
                      onPointerCancel={handleProgressPointerUp}
                    >
                      <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 rounded-full shadow-sm"
                        style={{ width: `${progressPercent}%` }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-white border-2 border-blue-500 rounded-full shadow-lg cursor-grab active:cursor-grabbing z-10"
                        style={{ left: `${progressPercent}%` }}
                      >
                        <div className="absolute inset-1 bg-blue-500 rounded-full"></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                      <span>拖动波形选择剪辑区域，拖动进度条调整试听位置</span>
                      <span>进度：{Math.round(progressPercent)}%</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
            {audioFile ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>提示：在波形区域按住并拖动即可选择剪辑范围；也可以在“精确时间剪辑”里输入开始和结束时间。</span>
                <span className={waveformStatus === 'ready' ? 'text-green-700' : waveformStatus === 'loading' ? 'text-blue-700' : 'text-gray-500'}>
                  {waveformStatus === 'ready' && '波形已生成'}
                  {waveformStatus === 'loading' && '正在生成波形，时间轴已可操作'}
                  {(waveformStatus === 'fallback' || waveformStatus === 'error') && '当前使用可拖动时间轴'}
                </span>
              </div>
            ) : (
              <span>支持常见音频格式；剪辑保存时会生成新文件，不会删除原始音乐。</span>
            )}
          </div>
        </div>
      </div>

      <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />
    </div>
  );
};

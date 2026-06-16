export interface BrowserRecordingOptions {
  outputPath: string;
  outputFormat?: 'wav' | 'mp3' | 'flac';
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
}

interface BrowserRecordingSession {
  stream: MediaStream;
  recorder: MediaRecorder;
  chunks: Blob[];
  inputMimeType: string;
  sampleRate: number;
  channels: number;
  outputFormat: 'wav' | 'mp3' | 'flac';
  outputPath: string;
}

let activeSession: BrowserRecordingSession | null = null;

export function isBrowserRecordingActive(): boolean {
  return Boolean(activeSession);
}

export async function startBrowserRecording(options: BrowserRecordingOptions): Promise<void> {
  if (activeSession) {
    throw new Error('录音已在进行中');
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前环境不支持麦克风录音');
  }

  if (typeof MediaRecorder === 'undefined') {
    throw new Error('当前环境不支持稳定录音组件');
  }

  const sampleRate = options.sampleRate || 48000;
  const channels = Math.max(1, Math.min(options.channels || 1, 2));
  const outputFormat = normalizeOutputFormat(options.outputFormat, options.outputPath);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: channels,
      sampleRate,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });

  try {
    const mimeType = pickSupportedMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = (event: Event) => {
      console.error('MediaRecorder error:', event);
    };

    await startRecorder(recorder);

    activeSession = {
      stream,
      recorder,
      chunks,
      inputMimeType: recorder.mimeType || mimeType || 'audio/webm',
      sampleRate,
      channels,
      outputFormat,
      outputPath: options.outputPath
    };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

export async function stopBrowserRecording(): Promise<{ outputPath: string; bytes: number }> {
  const session = activeSession;
  if (!session) {
    throw new Error('没有正在进行的录音');
  }

  activeSession = null;

  const recordedBlob = await stopRecorder(session);
  session.stream.getTracks().forEach((track) => track.stop());

  if (!recordedBlob || recordedBlob.size === 0) {
    throw new Error('录音没有采集到声音数据');
  }

  const inputData = new Uint8Array(await recordedBlob.arrayBuffer());
  const inputFormat = getInputFormat(recordedBlob.type || session.inputMimeType);
  const result = await window.electronAPI.ffmpeg.convert({
    inputData,
    inputFormat,
    inputName: `recording.${inputFormat}`,
    outputFormat: session.outputFormat,
    sampleRate: session.sampleRate,
    channels: session.channels
  });

  if (!result?.success || !result.data) {
    throw new Error(result?.error || '录音转换失败');
  }

  const outputData = toUint8Array(result.data);
  await window.electronAPI.fs.writeFile(session.outputPath, outputData);

  return {
    outputPath: session.outputPath,
    bytes: outputData.byteLength
  };
}

export async function cancelBrowserRecording(): Promise<void> {
  const session = activeSession;
  activeSession = null;

  if (!session) return;

  try {
    if (session.recorder.state !== 'inactive') {
      session.recorder.stop();
    }
  } catch {}

  session.stream.getTracks().forEach((track) => track.stop());
}

function pickSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return '';
}

function startRecorder(recorder: MediaRecorder): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    recorder.onstart = () => settle(resolve);
    recorder.onerror = (event: Event) => {
      console.error('MediaRecorder start error:', event);
      settle(() => reject(new Error('录音启动失败')));
    };

    recorder.start(1000);

    window.setTimeout(() => {
      if (recorder.state === 'recording') {
        settle(resolve);
      }
    }, 800);
  });
}

function stopRecorder(session: BrowserRecordingSession): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const recorder = session.recorder;

    const finish = () => {
      resolve(new Blob(session.chunks, { type: session.inputMimeType }));
    };

    if (recorder.state === 'inactive') {
      finish();
      return;
    }

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        session.chunks.push(event.data);
      }
    };
    recorder.onstop = finish;
    recorder.onerror = (event: Event) => {
      console.error('MediaRecorder stop error:', event);
      reject(new Error('录音停止失败'));
    };

    try {
      recorder.requestData();
    } catch {}

    recorder.stop();
  });
}

function normalizeOutputFormat(
  outputFormat: BrowserRecordingOptions['outputFormat'],
  outputPath: string
): 'wav' | 'mp3' | 'flac' {
  if (outputFormat === 'mp3' || outputFormat === 'flac' || outputFormat === 'wav') {
    return outputFormat;
  }

  const ext = outputPath.split('.').pop()?.toLowerCase();
  if (ext === 'mp3' || ext === 'flac' || ext === 'wav') {
    return ext;
  }

  return 'wav';
}

function getInputFormat(mimeType: string): string {
  const lower = mimeType.toLowerCase();

  if (lower.includes('mp4') || lower.includes('aac')) return 'm4a';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('webm')) return 'webm';

  return 'webm';
}

function toUint8Array(data: any): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (Array.isArray(data)) {
    return new Uint8Array(data);
  }

  if (data?.type === 'Buffer' && Array.isArray(data.data)) {
    return new Uint8Array(data.data);
  }

  if (data?.buffer instanceof ArrayBuffer) {
    return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
  }

  throw new Error('录音转换结果无效');
}

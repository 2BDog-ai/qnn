export interface BrowserRecordingOptions {
  outputPath: string;
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
}

interface BrowserRecordingSession {
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
  inputSampleRate: number;
  channels: number;
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
    throw new Error('当前环境不支持浏览器录音');
  }

  const channels = Math.max(1, Math.min(options.channels || 1, 2));
  const requestedRate = options.sampleRate || 48000;
  const audioContext = new AudioContext({ sampleRate: requestedRate });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: channels,
        sampleRate: requestedRate,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, channels, channels);
    const chunks: Float32Array[] = [];

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer;
      const channelData = input.getChannelData(0);
      const frame = new Float32Array(channelData.length * channels);

      if (channels === 1) {
        frame.set(channelData);
      } else {
        const right = input.numberOfChannels > 1 ? input.getChannelData(1) : channelData;
        for (let i = 0; i < channelData.length; i += 1) {
          frame[i * 2] = channelData[i];
          frame[i * 2 + 1] = right[i];
        }
      }

      chunks.push(frame);
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    activeSession = {
      stream,
      audioContext,
      source,
      processor,
      chunks,
      inputSampleRate: audioContext.sampleRate,
      channels,
      outputPath: options.outputPath
    };
  } catch (error) {
    await closeAudioContext(audioContext);
    throw error;
  }
}

export async function stopBrowserRecording(): Promise<{ outputPath: string; bytes: number }> {
  const session = activeSession;
  if (!session) {
    throw new Error('没有正在进行的录音');
  }

  activeSession = null;

  try {
    session.processor.disconnect();
    session.source.disconnect();
  } catch {}

  session.stream.getTracks().forEach((track) => track.stop());
  await closeAudioContext(session.audioContext);

  const samples = mergeChunks(session.chunks);
  if (samples.length === 0) {
    throw new Error('录音没有采集到声音数据');
  }

  const wav = encodeWav(samples, session.inputSampleRate, session.channels, 16);
  await window.electronAPI.fs.writeFile(session.outputPath, new Uint8Array(wav));

  return {
    outputPath: session.outputPath,
    bytes: wav.byteLength
  };
}

export async function cancelBrowserRecording(): Promise<void> {
  const session = activeSession;
  activeSession = null;

  if (!session) return;

  try {
    session.processor.disconnect();
    session.source.disconnect();
  } catch {}

  session.stream.getTracks().forEach((track) => track.stop());
  await closeAudioContext(session.audioContext);
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Float32Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number, channels: number, bitDepth: 16 | 24): ArrayBuffer {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = softLimit(samples[i]);
    if (bitDepth === 16) {
      const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, Math.round(value), true);
      offset += 2;
    } else {
      const value = Math.round((sample < 0 ? sample * 0x800000 : sample * 0x7fffff));
      view.setUint8(offset, value & 0xff);
      view.setUint8(offset + 1, (value >> 8) & 0xff);
      view.setUint8(offset + 2, (value >> 16) & 0xff);
      offset += 3;
    }
  }

  return buffer;
}

function softLimit(input: number): number {
  if (!Number.isFinite(input)) return 0;

  const attenuated = input * 0.8;
  const limited = Math.tanh(attenuated * 1.6) / Math.tanh(1.6);
  return Math.max(-0.95, Math.min(0.95, limited));
}

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

async function closeAudioContext(audioContext: AudioContext): Promise<void> {
  if (audioContext.state !== 'closed') {
    await audioContext.close().catch(() => undefined);
  }
}

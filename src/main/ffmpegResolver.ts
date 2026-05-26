import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

export type FFmpegTool = 'ffmpeg' | 'ffprobe';

const resolvedToolCache = new Map<FFmpegTool, string>();

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter(Boolean)));
}

export function isShellCommand(candidate: string): boolean {
  return !candidate.includes('/') && !candidate.includes('\\');
}

function toolFileName(tool: FFmpegTool): string {
  return process.platform === 'win32' ? `${tool}.exe` : tool;
}

function buildSystemCandidates(tool: FFmpegTool): string[] {
  const filename = toolFileName(tool);

  if (process.platform === 'win32') {
    return [
      filename,
      `C:\\ffmpeg\\bin\\${filename}`,
      `C:\\Program Files\\FFmpeg\\bin\\${filename}`
    ];
  }

  if (process.platform === 'darwin') {
    return [
      `/opt/homebrew/bin/${tool}`,
      `/usr/local/bin/${tool}`,
      `/usr/bin/${tool}`,
      tool
    ];
  }

  return [
    `/usr/local/bin/${tool}`,
    `/usr/bin/${tool}`,
    tool
  ];
}

export function buildFFmpegToolCandidates(tool: FFmpegTool): string[] {
  const filename = toolFileName(tool);
  const executableDir = path.dirname(process.execPath);

  let appPath = '';
  let appDir = '';
  try {
    appPath = app.getAppPath();
    appDir = path.dirname(appPath);
  } catch {}

  const resourceBase = app.isPackaged
    ? process.resourcesPath
    : path.join(process.cwd(), 'resources');

  return uniquePaths([
    process.env[tool === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'] || '',
    path.join(process.cwd(), 'resources', 'ffmpeg', filename),
    appPath ? path.join(appPath, 'resources', 'ffmpeg', filename) : '',
    appDir ? path.join(appDir, 'resources', 'ffmpeg', filename) : '',
    resourceBase ? path.join(resourceBase, 'ffmpeg', filename) : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'ffmpeg', filename) : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'resources', 'ffmpeg', filename) : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'ffmpeg', filename) : '',
    path.join(executableDir, 'ffmpeg', filename),
    path.join(executableDir, 'resources', 'ffmpeg', filename),
    path.join(executableDir, '..', 'Resources', 'ffmpeg', filename),
    ...buildSystemCandidates(tool)
  ]);
}

function canTryCandidate(candidate: string): boolean {
  if (isShellCommand(candidate)) {
    return true;
  }

  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

export function testFFmpegTool(candidate: string, tool: FFmpegTool): { ok: boolean; version?: string; error?: string } {
  try {
    const result = spawnSync(candidate, ['-version'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    });

    const output = `${result.stdout || ''}${result.stderr || ''}`;
    const versionMatch = output.match(new RegExp(`${tool} version\\s+([^\\s]+)`, 'i'));

    if (!result.error && result.status === 0 && versionMatch) {
      return { ok: true, version: versionMatch[1] };
    }

    const detail = result.error?.message || output.trim() || `exit code ${result.status}`;
    return { ok: false, error: detail.slice(-500) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function resolveFFmpegTool(tool: FFmpegTool): string {
  const cached = resolvedToolCache.get(tool);
  if (cached) {
    return cached;
  }

  const candidates = buildFFmpegToolCandidates(tool);
  const failures: string[] = [];

  for (const candidate of candidates) {
    if (!canTryCandidate(candidate)) {
      continue;
    }

    const result = testFFmpegTool(candidate, tool);
    if (result.ok) {
      console.log(`Using ${tool}: ${candidate}${result.version ? ` (${result.version})` : ''}`);
      resolvedToolCache.set(tool, candidate);
      return candidate;
    }

    failures.push(`${candidate}: ${result.error || 'not available'}`);
  }

  console.warn(`${tool} is not available from bundled or system paths. Last errors:`, failures.slice(-5));
  const fallback = toolFileName(tool);
  resolvedToolCache.set(tool, fallback);
  return fallback;
}

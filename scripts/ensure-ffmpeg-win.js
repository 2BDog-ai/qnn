const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = process.cwd();
const ffmpegDir = path.join(projectRoot, 'resources', 'ffmpeg');
const ffmpegExe = path.join(ffmpegDir, 'ffmpeg.exe');
const ffprobeExe = path.join(ffmpegDir, 'ffprobe.exe');
const downloadUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function removeDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function run(file, args) {
  execFileSync(file, args, { stdio: 'inherit' });
}

if (process.platform !== 'win32') {
  console.log('Skipping Windows FFmpeg setup on non-Windows platform.');
  process.exit(0);
}

if (exists(ffmpegExe) && exists(ffprobeExe)) {
  console.log('FFmpeg already bundled for Windows.');
  process.exit(0);
}

console.log('Bundled FFmpeg missing. Downloading Windows FFmpeg package...');
ensureDir(ffmpegDir);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wmp-ffmpeg-'));
const archivePath = path.join(tempRoot, 'ffmpeg-windows.zip');
const extractDir = path.join(tempRoot, 'extract');

try {
  run('curl.exe', ['-L', downloadUrl, '-o', archivePath]);
  ensureDir(extractDir);
  run('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    `Expand-Archive -Path '${archivePath}' -DestinationPath '${extractDir}' -Force`
  ]);

  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  const packageDirEntry = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith('ffmpeg-'));
  if (!packageDirEntry) {
    throw new Error('Unable to locate extracted FFmpeg directory.');
  }

  const binDir = path.join(extractDir, packageDirEntry.name, 'bin');
  const sourceFfmpeg = path.join(binDir, 'ffmpeg.exe');
  const sourceFfprobe = path.join(binDir, 'ffprobe.exe');

  if (!exists(sourceFfmpeg) || !exists(sourceFfprobe)) {
    throw new Error('Downloaded FFmpeg package does not contain ffmpeg.exe and ffprobe.exe.');
  }

  fs.copyFileSync(sourceFfmpeg, ffmpegExe);
  fs.copyFileSync(sourceFfprobe, ffprobeExe);

  console.log(`Bundled FFmpeg ready: ${ffmpegExe}`);
  console.log(`Bundled FFprobe ready: ${ffprobeExe}`);
} finally {
  removeDir(tempRoot);
}

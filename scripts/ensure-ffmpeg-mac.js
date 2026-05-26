const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = process.cwd();
const ffmpegDir = path.join(projectRoot, 'resources', 'ffmpeg');
const ffmpegPath = path.join(ffmpegDir, 'ffmpeg');
const ffprobePath = path.join(ffmpegDir, 'ffprobe');

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

function run(file, args) {
  execFileSync(file, args, { stdio: 'inherit' });
}

function findExecutable(dirPath, name) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const found = findExecutable(fullPath, name);
      if (found) return found;
    } else if (entry.name === name) {
      return fullPath;
    }
  }
  return null;
}

function downloadAndExtract(toolName, arch, targetPath, tempRoot) {
  const archivePath = path.join(tempRoot, `${toolName}.zip`);
  const extractDir = path.join(tempRoot, toolName);
  const url = arch === 'amd64'
    ? `https://evermeet.cx/ffmpeg/getrelease/${toolName === 'ffmpeg' ? 'zip' : `${toolName}/zip`}`
    : `https://ffmpeg.martin-riedl.de/redirect/latest/macos/${arch}/release/${toolName}.zip`;

  console.log(`Downloading macOS ${arch} ${toolName}: ${url}`);
  run('curl', ['-L', '--fail', url, '-o', archivePath]);
  ensureDir(extractDir);
  run('unzip', ['-q', '-o', archivePath, '-d', extractDir]);

  const executable = findExecutable(extractDir, toolName);
  if (!executable) {
    throw new Error(`Downloaded archive does not contain ${toolName}.`);
  }

  fs.copyFileSync(executable, targetPath);
  fs.chmodSync(targetPath, 0o755);
  console.log(`Bundled ${toolName}: ${targetPath}`);
}

if (process.platform !== 'darwin') {
  console.log('Skipping macOS FFmpeg setup on non-macOS platform.');
  process.exit(0);
}

const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
ensureDir(ffmpegDir);

for (const windowsBinary of ['ffmpeg.exe', 'ffprobe.exe']) {
  const binaryPath = path.join(ffmpegDir, windowsBinary);
  if (exists(binaryPath)) {
    fs.rmSync(binaryPath, { force: true });
  }
}

const forceRefresh = process.env.GITHUB_ACTIONS === 'true';

if (exists(ffmpegPath) && exists(ffprobePath) && !forceRefresh) {
  console.log('FFmpeg already bundled for macOS.');
  run(ffmpegPath, ['-version']);
  run(ffprobePath, ['-version']);
  process.exit(0);
}

if (forceRefresh) {
  for (const binaryPath of [ffmpegPath, ffprobePath]) {
    if (exists(binaryPath)) {
      fs.rmSync(binaryPath, { force: true });
    }
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wmp-ffmpeg-mac-'));

try {
  downloadAndExtract('ffmpeg', arch, ffmpegPath, tempRoot);
  downloadAndExtract('ffprobe', arch, ffprobePath, tempRoot);
  run(ffmpegPath, ['-version']);
  run(ffprobePath, ['-version']);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

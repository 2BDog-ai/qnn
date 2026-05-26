const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DEMUCS_VERSION = 'v0.3.4';
const projectRoot = process.cwd();
const demucsDir = path.join(projectRoot, 'resources', 'demucs', 'mac');
const demucsPath = path.join(demucsDir, 'demucs');

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

function run(file, args, options = {}) {
  execFileSync(file, args, {
    stdio: 'inherit',
    ...options,
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });
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

function verifyDemucs() {
  run(demucsPath, ['--help']);
}

function installFromArchive(arch, tempRoot) {
  const archivePath = path.join(tempRoot, 'demucs.tar.gz');
  const extractDir = path.join(tempRoot, 'demucs-release');
  const assetName = arch === 'arm64'
    ? 'demucs-aarch64-apple-darwin.tar.gz'
    : 'demucs-x86_64-apple-darwin.tar.gz';
  const url = `https://github.com/nikhilunni/demucs-rs/releases/download/${DEMUCS_VERSION}/${assetName}`;

  console.log(`Downloading macOS ${arch} Demucs: ${url}`);
  run('curl', ['-L', '--fail', url, '-o', archivePath]);
  ensureDir(extractDir);
  run('tar', ['-xzf', archivePath, '-C', extractDir]);

  const executable = findExecutable(extractDir, 'demucs');
  if (!executable) {
    throw new Error('Downloaded Demucs archive does not contain demucs.');
  }

  fs.copyFileSync(executable, demucsPath);
  fs.chmodSync(demucsPath, 0o755);
}

if (process.platform !== 'darwin') {
  console.log('Skipping macOS Demucs setup on non-macOS platform.');
  process.exit(0);
}

const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const forceRefresh = process.env.GITHUB_ACTIONS === 'true';
ensureDir(demucsDir);

if (arch === 'x64') {
  if (exists(demucsPath)) {
    fs.rmSync(demucsPath, { force: true });
  }
  console.log('Skipping bundled Demucs on Intel macOS. The app will use FFmpeg compatible instrumental extraction.');
  process.exit(0);
}

if (exists(demucsPath) && !forceRefresh) {
  console.log('Demucs already bundled for macOS.');
  verifyDemucs();
  process.exit(0);
}

if (forceRefresh && exists(demucsPath)) {
  fs.rmSync(demucsPath, { force: true });
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wmp-demucs-mac-'));

try {
  installFromArchive(arch, tempRoot);

  verifyDemucs();
  console.log(`Bundled Demucs: ${demucsPath}`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const fs = require('fs');
const path = require('path');

const targets = ['dist', 'dist-electron', 'dist-build'];

for (const target of targets) {
  fs.rmSync(path.join(process.cwd(), target), { recursive: true, force: true });
}

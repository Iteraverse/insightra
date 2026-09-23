import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = path.join(
  root,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
if (!existsSync(python)) {
  console.error('请先按 README 创建 .venv 并安装 backend/requirements.txt。');
  process.exit(1);
}
const args = process.argv.includes('--test')
  ? ['-m', 'unittest', 'discover', '-s', 'tests', '-v']
  : ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--reload'];
const child = spawn(python, args, { cwd: path.join(root, 'backend'), stdio: 'inherit' });
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

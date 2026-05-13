import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const skipped = new Set(['node_modules', 'dist', 'data', '.git', '.specify']);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (skipped.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(fullPath)));
    if (entry.isFile() && /\.(m?js)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

const files = await listFiles(root);
for (const file of files) {
  await execFileAsync(process.execPath, ['--check', file], { cwd: root });
}

console.log(`Checked ${files.length} JavaScript files.`);

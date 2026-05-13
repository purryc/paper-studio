import { openSync, writeSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
const dataDir = path.join(projectRoot, 'data');
const pidPath = path.join(dataDir, 'dev-server.pid');
const logPath = path.join(dataDir, 'dev-server.log');
const action = process.argv[2] || 'start';

function isAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid() {
  try {
    const text = await readFile(pidPath, 'utf8');
    return Number(text.trim());
  } catch {
    return null;
  }
}

async function isUrlReady(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function readStatus() {
  const pid = await readPid();
  const pidAlive = isAlive(pid);
  const frontendReady = await isUrlReady('http://127.0.0.1:5173/');
  const apiReady = await isUrlReady('http://127.0.0.1:8787/api/health');
  return { pid, pidAlive, frontendReady, apiReady };
}

async function waitUntilReady(timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let status = await readStatus();
  while (Date.now() < deadline) {
    if (status.frontendReady && status.apiReady) return status;
    await new Promise((resolve) => setTimeout(resolve, 500));
    status = await readStatus();
  }
  return status;
}

async function start() {
  await mkdir(dataDir, { recursive: true });
  const current = await readStatus();
  if (current.frontendReady && current.apiReady) {
    console.log(`Paper Studio already running at http://127.0.0.1:5173/ (pid ${current.pid || 'unknown'}).`);
    return;
  }

  if (current.pidAlive) {
    console.log(`Stopping stale Paper Studio dev process ${current.pid}.`);
    process.kill(current.pid, 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  const logFd = openSync(logPath, 'a');
  writeSync(logFd, `\n\n[${new Date().toISOString()}] Starting Paper Studio dev server\n`);
  const child = spawn(process.execPath, ['scripts/dev.mjs'], {
    cwd: projectRoot,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  await writeFile(pidPath, `${child.pid}\n`);

  const next = await waitUntilReady();
  if (!next.frontendReady || !next.apiReady) {
    throw new Error(`Paper Studio started as pid ${child.pid}, but is not ready yet. Check ${logPath}.`);
  }

  console.log(`Paper Studio running at http://127.0.0.1:5173/ (pid ${child.pid}).`);
  console.log(`Log: ${logPath}`);
}

async function stop() {
  const pid = await readPid();
  if (!isAlive(pid)) {
    await rm(pidPath, { force: true });
    console.log('Paper Studio dev server is not running.');
    return;
  }
  process.kill(pid, 'SIGTERM');
  await rm(pidPath, { force: true });
  console.log(`Stopped Paper Studio dev server pid ${pid}.`);
}

async function status() {
  const current = await readStatus();
  console.log(JSON.stringify(current, null, 2));
}

if (action === 'start') await start();
else if (action === 'stop') await stop();
else if (action === 'status') await status();
else {
  console.error('Usage: node scripts/dev-daemon.mjs [start|stop|status]');
  process.exitCode = 1;
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Request failed: ${response.status}`);
  }
  return payload;
}

export async function getHealth() {
  return parseResponse(await fetch('/api/health'));
}

export async function getServerCameras() {
  return parseResponse(await fetch('/api/cameras'));
}

export async function uploadCapture(file, metadata) {
  const form = new FormData();
  form.set('image', file);
  form.set('sourceDeviceLabel', metadata.sourceDeviceLabel || '');
  form.set('sourceKind', metadata.sourceKind || 'upload');
  return parseResponse(await fetch('/api/captures', { method: 'POST', body: form }));
}

export async function uploadSourceFolder(files) {
  const form = new FormData();
  const list = Array.from(files || []);
  const folderName =
    list[0]?.webkitRelativePath?.split('/')?.[0] ||
    list[0]?.name ||
    'selected-folder';
  form.set('folderName', folderName);
  for (const file of list) {
    form.append('files', file, file.webkitRelativePath || file.name);
  }
  return parseResponse(await fetch('/api/sources/folder-upload', { method: 'POST', body: form }));
}

export async function captureServerSnapshot(deviceIndex, deviceLabel) {
  return parseResponse(
    await fetch('/api/captures/server-snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceIndex, deviceLabel }),
    }),
  );
}

export function cameraStreamUrl(deviceLabel, nonce) {
  const params = new URLSearchParams();
  if (deviceLabel) params.set('deviceLabel', deviceLabel);
  if (nonce) params.set('t', String(nonce));
  return `/api/cameras/stream?${params.toString()}`;
}

export function cameraFrameUrl(deviceLabel, nonce) {
  const params = new URLSearchParams();
  if (deviceLabel) params.set('deviceLabel', deviceLabel);
  if (nonce) params.set('t', String(nonce));
  return `/api/cameras/frame?${params.toString()}`;
}

export async function createTranscript({ audioFile, text, engine }) {
  const form = new FormData();
  form.set('engine', engine || (audioFile ? 'whisper' : 'manual'));
  if (audioFile) form.set('audio', audioFile);
  if (text) form.set('text', text);
  return parseResponse(await fetch('/api/transcriptions', { method: 'POST', body: form }));
}

export async function createJob(payload) {
  return parseResponse(
    await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function confirmJob(id) {
  return parseResponse(await fetch(`/api/jobs/${id}/confirm`, { method: 'POST' }));
}

export async function getJob(id) {
  return parseResponse(await fetch(`/api/jobs/${id}`));
}

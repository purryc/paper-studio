const CAMERA_PRIORITY = [
  'MacBook Pro Desk View Camera',
  'che iphone Desk View Camera',
  'che iphone Camera',
  'MacBook Pro Camera',
];

export function cameraRank(device) {
  const label = device?.label || '';
  if (!label) return 100;
  const exact = CAMERA_PRIORITY.findIndex((name) => label === name);
  if (exact >= 0) return exact;
  if (/desk view/i.test(label)) return 10;
  if (/iphone/i.test(label)) return 20;
  if (/macbook/i.test(label)) return 30;
  return 50;
}

export function sortServerCameras(cameras) {
  return [...cameras].sort((a, b) => cameraRank(a) - cameraRank(b));
}

export function sortVideoDevices(devices) {
  return [...devices]
    .filter((device) => device.kind === 'videoinput')
    .sort((a, b) => cameraRank(a) - cameraRank(b));
}

export function sourceKindForLabel(label) {
  if (/desk view/i.test(label || '')) return 'desk-view';
  if (label) return 'camera';
  return 'upload';
}

export function sourceStatusLabel(sourceKind) {
  if (sourceKind === 'desk-view') return 'Desk View active';
  if (sourceKind === 'camera') return 'Fallback camera';
  return 'Uploaded image';
}

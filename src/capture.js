export async function captureVideoFrame(video) {
  if (!video?.videoWidth || !video?.videoHeight) {
    throw new Error('Camera stream is not ready yet.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('Unable to export camera frame.'));
    }, 'image/png');
  });
  return new File([blob], `desk-view-${Date.now()}.png`, { type: 'image/png' });
}

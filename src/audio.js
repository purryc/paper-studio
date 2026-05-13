export async function recordAudioUntilStopped(onStopReady) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener('stop', () => {
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    onStopReady(new File([blob], `speech-${Date.now()}.webm`, { type: blob.type }));
  });
  recorder.start();
  return () => recorder.stop();
}

import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveCommand } from './preflight.js';

const execFileAsync = promisify(execFile);

export async function transcribeAudio({ audioPath, outputDir }) {
  const whisper = await resolveCommand('whisper', ['/Users/hmi/.local/bin/whisper']);
  if (!whisper) {
    return {
      status: 'failed',
      text: '',
      error: 'Whisper CLI is not installed or not on PATH.',
    };
  }

  await mkdir(outputDir, { recursive: true });
  try {
    await execFileAsync(
      whisper,
      [audioPath, '--model', 'base', '--output_format', 'txt', '--output_dir', outputDir],
      { timeout: 180000, maxBuffer: 1024 * 1024 * 4 },
    );
    const textPath = path.join(outputDir, `${path.basename(audioPath, path.extname(audioPath))}.txt`);
    const text = (await readFile(textPath, 'utf8')).trim();
    return { status: 'completed', text, textPath };
  } catch (error) {
    return {
      status: 'failed',
      text: '',
      error: error.stderr || error.message,
    };
  }
}

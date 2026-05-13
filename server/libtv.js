import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dataUrl } from './storage.js';

const execFileAsync = promisify(execFile);
const SKILL_DIR = '/Users/hmi/.agents/skills/libtv-skill/scripts';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);
const LIBTV_QUERY_TIMEOUT_MS = 60000;
const LIBTV_QUERY_RETRIES = 3;
const STYLE_PRESETS = {
  'short-video-ad': {
    label: '短视频广告风',
    prompt:
      '短视频广告风格：强主体、清晰卖点、明亮干净的商业视觉、产品广告级构图、适合社交媒体首屏停留，画面有明确前景主体和传播记忆点。',
  },
  illustration: {
    label: '插画风',
    prompt:
      '插画风格：干净线条、友好现代、轻量产品插画质感、轮廓清晰、色彩协调、适合概念表达和产品说明。',
  },
  watercolor: {
    label: '水彩画风',
    prompt:
      '水彩画风：柔和纸张肌理、半透明叠色、自然晕染、手工绘本质感，保持主体和结构清晰可辨。',
  },
  'cinematic-realism': {
    label: '写实电影风',
    prompt:
      '写实电影风格：真实摄影质感、电影级光影、自然景深、可信材质、克制高级的镜头语言和场景氛围。',
  },
};

function stylePreset(job) {
  return STYLE_PRESETS[job.creativeStyle] || STYLE_PRESETS['short-video-ad'];
}

function optimizedMediaPrompt({ job, outputType }) {
  const preset = stylePreset(job);
  const aspect = job.aspectRatio || '4:3';
  const motion =
    outputType === 'video'
      ? '视频要求：用参考图作为主体和构图基础，生成一个短而完整的镜头；有轻微镜头运动或主体动作，但不要改变核心物体关系。'
      : '图像要求：用参考图作为主体和构图基础，生成一张完整单图；结构清楚，主体明确，不要生成多宫格。';
  return [
    `用户原始意图：${job.prompt}`,
    `视觉风格：${preset.label}`,
    `风格扩展：${preset.prompt}`,
    `画幅：${aspect}`,
    motion,
    '构图约束：以参考手绘草图为准，保持人物朝向、视线方向、身体朝向、手臂动作、牵引线方向、主体之间的左右/上下相对位置一致；不要镜像、不要把主体换边、不要把正侧面改成正脸。',
    '保留手绘草图中的主要对象、相对位置、箭头/关系和叙事重点；如果草图抽象，则把它转译为清晰可理解的视觉场景，但仍需保持原始布局和方向。',
    '避免无关文字、水印、UI 截图感、过度复杂背景；输出应该像可直接用于演示的成品。',
  ].join('\n');
}

async function runPython(script, args, options = {}) {
  const { stdout } = await execFileAsync('python3', [path.join(SKILL_DIR, script), ...args], {
    timeout: options.timeout || 180000,
    maxBuffer: 1024 * 1024 * 4,
  });
  return JSON.parse(stdout);
}

function isTransientLibtvQueryError(error) {
  const message = String(error?.message || error || '');
  return /IncompleteRead|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(message);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function querySessionWithRetry(sessionId) {
  let lastError = null;
  for (let attempt = 1; attempt <= LIBTV_QUERY_RETRIES; attempt += 1) {
    try {
      return await runPython('query_session.py', [sessionId], { timeout: LIBTV_QUERY_TIMEOUT_MS });
    } catch (error) {
      lastError = error;
      if (!isTransientLibtvQueryError(error) || attempt === LIBTV_QUERY_RETRIES) break;
      await sleep(1200 * attempt);
    }
  }
  throw lastError;
}

function jobMarker(job) {
  return `paper-studio-job:${job.id}`;
}

function preferredCapturePath(capture) {
  return capture.cleanImagePath || capture.paperCropPath || capture.rawImagePath;
}

function urlExtension(url) {
  return path.extname(new URL(url).pathname).toLowerCase();
}

function typeForExtension(extension) {
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return 'unknown';
}

export function filterLibtvResultUrls(messages, marker, outputType) {
  const markerIndex = messages.findLastIndex((message) => String(message.content || '').includes(marker));
  const currentMessages = markerIndex >= 0 ? messages.slice(markerIndex) : messages;
  const urls = [];
  const urlPattern = /https:\/\/libtv-res\.liblib\.art\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp|mp4|mov|webm)(?:\?[^\s"'<>]+)?/g;

  for (const message of currentMessages) {
    const content = message.content;
    if (!content || typeof content !== 'string') continue;

    if (message.role === 'tool') {
      try {
        const data = JSON.parse(content);
        const taskResult = data.task_result || {};
        for (const image of taskResult.images || []) {
          if (image.previewPath) urls.push(image.previewPath);
        }
        for (const video of taskResult.videos || []) {
          const videoUrl = video.previewPath || video.url;
          if (videoUrl) urls.push(videoUrl);
        }
      } catch {
        // Tool messages may also contain plain text; the regex pass below handles that case.
      }
    }

    if (message.role === 'assistant' || message.role === 'tool') {
      urls.push(...content.matchAll(urlPattern).map((match) => match[0]));
    }
  }

  const seen = new Set();
  return urls.filter((url) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return typeForExtension(urlExtension(url)) === outputType;
  });
}

async function downloadUrl(url, filePath) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Paper-Studio/0.1' } });
  if (!response.ok) throw new Error(`LibTV download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, bytes);
}

async function waitForCurrentResult({ sessionId, outputDir, job, outputType }) {
  const marker = jobMarker(job);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180000) {
    const session = await querySessionWithRetry(sessionId);
    const urls = filterLibtvResultUrls(session.messages || [], marker, outputType);
    if (urls.length) {
      const url = urls[urls.length - 1];
      const extension = urlExtension(url) || (outputType === 'video' ? '.mp4' : '.png');
      const filePath = path.join(outputDir, `${job.id}_${outputType}${extension}`);
      await downloadUrl(url, filePath);
      return {
        label: `LibTV ${outputType}`,
        path: filePath,
        url: dataUrl(job.storage, filePath),
        mediaType: outputType,
        remoteUrl: url,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 8000));
  }
  throw new Error(`LibTV ${outputType} result was not ready within 3 minutes. Check the LibTV canvas and retry later.`);
}

function libtvMessage({ job, referenceUrl, outputType }) {
  const marker = jobMarker(job);
  const optimizedPrompt = optimizedMediaPrompt({ job, outputType });
  if (outputType === 'video') {
    return [
      `任务标记：${marker}`,
      `请根据这张手绘草图生成一段短视频。参考图：${referenceUrl}`,
      `优化后的生成提示词：\n${optimizedPrompt}`,
      '控制约束：视频使用 Kling O3 reference image-to-video，单条输出，低成本；不要使用 Seedance VIP、4K、高品质、VIP、4K 或更贵模型；如需升级先停止并要求用户确认。',
    ].join('\n');
  }

  return [
    `任务标记：${marker}`,
    `请根据这张手绘草图生成一张可用的视觉图。参考图：${referenceUrl}`,
    `优化后的生成提示词：\n${optimizedPrompt}`,
    '控制约束：图片生成默认使用 Seedream 5.0 Lite，count=1，searchable=0，quality=2K。',
    '不要使用 Seedance VIP、Midjourney、4K 或更贵模型；如果需要升级模型，先停止并要求用户确认。',
  ].join('\n');
}

export async function runLibtvMediaJob({ job, capture, storage, mockProviders = false }) {
  const outputType = job.mode === 'video' ? 'video' : 'image';
  const outputDir = path.join(storage.resultsDir, job.id);
  await mkdir(outputDir, { recursive: true });

  if (mockProviders) {
    if (outputType === 'video') {
      const resultPath = path.join(outputDir, 'libtv-mock-result.mp4');
      await writeFile(resultPath, 'mock video placeholder\n', 'utf8');
      return {
        providerSession: { providerId: 'libtv', mock: true, marker: jobMarker(job) },
        optimizedPrompt: optimizedMediaPrompt({ job, outputType }),
        resultFiles: [{ label: 'Mock LibTV video', path: resultPath, url: dataUrl(storage, resultPath), mediaType: 'video' }],
      };
    }

    const resultPath = path.join(outputDir, 'libtv-mock-result.png');
    await copyFile(preferredCapturePath(capture), resultPath);
    return {
      providerSession: { providerId: 'libtv', mock: true, marker: jobMarker(job) },
      optimizedPrompt: optimizedMediaPrompt({ job, outputType }),
      resultFiles: [{ label: 'Mock LibTV image', path: resultPath, url: dataUrl(storage, resultPath), mediaType: 'image' }],
    };
  }

  if (!process.env.LIBTV_ACCESS_KEY) {
    throw new Error('LIBTV_ACCESS_KEY is not configured. Draft is safe; confirm cannot run LibTV yet.');
  }

  const upload = await runPython('upload_file.py', [preferredCapturePath(capture)]);
  const referenceUrl = upload.url;
  if (!referenceUrl) throw new Error('LibTV upload did not return a reference URL.');

  const session = await runPython('create_session.py', [libtvMessage({ job, referenceUrl, outputType })]);
  const sessionId = session.sessionId;
  if (!sessionId) throw new Error('LibTV did not return sessionId.');

  const resultFile = await waitForCurrentResult({
    sessionId,
    outputDir,
    job: { ...job, storage },
    outputType,
  });

  return {
    providerSession: {
      providerId: 'libtv',
      sessionId,
      projectUuid: session.projectUuid,
      projectUrl: session.projectUrl,
      marker: jobMarker(job),
    },
    optimizedPrompt: optimizedMediaPrompt({ job, outputType }),
    resultFiles: [resultFile],
  };
}

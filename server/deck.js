import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pptxgen from 'pptxgenjs';
import { dataUrl } from './storage.js';
import { resolveCommand } from './preflight.js';
import { buildSourceManifest, mergeSourceManifests, readSourceSetManifest } from './sources.js';

const execFileAsync = promisify(execFile);
const SOURCE_KEYWORDS = ['参考', '资料', '文件夹', '文档', 'source', 'folder', 'docs', 'based on'];
const FLOWCHART_PROVIDER_TIMEOUT_MS = 45000;
const DECK_PROVIDER_TIMEOUT_MS = 240000;

function shouldUseSourceContext(job) {
  if (job.sourcePolicy === 'off') return false;
  if (job.sourcePolicy === 'on') return Boolean(job.sourceRoot || job.sourceSetId);
  const prompt = String(job.prompt || '').toLowerCase();
  return Boolean(job.sourceRoot || job.sourceSetId) && SOURCE_KEYWORDS.some((keyword) => prompt.includes(keyword.toLowerCase()));
}

function sourceContextReason(job, used) {
  if (used) return job.sourcePolicy === 'on' ? 'forced-on' : 'prompt-requested-source';
  if (!job.sourceRoot && !job.sourceSetId) return 'no-source-selected';
  if (job.sourcePolicy === 'off') return 'forced-off';
  return 'selected-but-prompt-did-not-request-source';
}

function compactError(error) {
  return String(error?.message || error || '')
    .replace(/\s+/g, ' ')
    .slice(0, 260);
}

function sourceContext(sourceManifest) {
  if (!sourceManifest) return 'No source folder was selected.';
  const files = sourceManifest.files
    .slice(0, 24)
    .map((file) => `- ${file.relativePath} (${file.kind})`)
    .join('\n');
  return `
Source context:
The backend already scanned the selected folder or folder upload. Use only the excerpts and filenames below; do not ask the CLI to read the original source folder.

Source files:
${files || '- No supported source files found.'}

Source text excerpts:
${sourceManifest.textBundle || 'No markdown/txt excerpts were available. Use source file names as weak context only.'}
`.trim();
}

function sourceContextSection(sourceManifest) {
  if (!sourceManifest) return '';
  return `

Context from selected source folder:
${sourceContext(sourceManifest)}
`.trim();
}

function deckPrompt({ job, capture, sourceManifest }) {
  const sketchInstruction = {
    structure: 'Treat the sketch as a presentation structure or mind map.',
    layout: 'Treat the sketch as a page layout reference: title areas, image zones, hierarchy, and visual rhythm matter.',
    mixed: 'Treat the sketch as both content structure and layout intent.',
    flowchart: 'Treat the sketch as a process or system flowchart.',
  }[job.sketchType || 'structure'];

  if (job.deckOutput === 'flowchart-page') {
    return `
You are converting a Desk View paper sketch into one Mermaid flowchart.

Input image:
input.png in this job workspace

Sketch interpretation:
${sketchInstruction}

Transcript / intent:
${job.prompt}

${sourceContextSection(sourceManifest)}

Requirements:
- Output ONLY Mermaid source, not Slidev markdown.
- Start with "flowchart TD" or "flowchart LR".
- Keep node labels concise and presentation-ready.
- Preserve the sketch semantics: node hierarchy, decision conditions, branches, and merge relationships.
- Use the source folder only if context was provided above; do not invent citations.
- No external paid API calls from inside the deck generation step.
- Do not call write_file, update_file, shell file creation, or any tool that edits files. Return Mermaid in stdout only.
`.trim();
  }

  return `
You are building a Slidev deck from a Desk View capture of a hand-drawn sketch.

Input image:
input.png in this job workspace

Sketch interpretation:
${sketchInstruction}

Transcript / intent:
${job.prompt}

${sourceContextSection(sourceManifest)}

Create a ${job.slideCountTarget || 8}-slide Apple keynote style deck.
Requirements:
- Output ONLY Slidev markdown.
- Use frontmatter with theme default, canvasWidth 1280, highlighter shiki.
- Visual direction: Apple keynote, dark stage, restrained typography, large titles, image-first rhythm.
- Explain the sketch as a product/prototype story, not generic lecture notes.
- Include concise speaker notes as HTML comments when useful.
- No external paid API calls from inside the deck generation step.
- Do not call write_file, update_file, shell file creation, or any tool that edits files. Return markdown in stdout only.
`.trim();
}

function fallbackSlides(job) {
  const title = job.mode === 'deck' ? 'Paper Studio Prototype' : 'Generated Deck';
  if (job.deckOutput === 'flowchart-page') {
    const mermaid = fallbackMermaid(job);
    return `---
theme: default
canvasWidth: 1280
highlighter: shiki
title: Paper Studio Flowchart
---

# Paper Studio Flowchart

\`\`\`mermaid
${mermaid}
\`\`\`

<!--
MERMAID_SOURCE
${mermaid}
-->
`;
  }
  return `---
theme: default
canvasWidth: 1280
highlighter: shiki
title: ${title}
---

# ${title}

${job.prompt}

---

# From Sketch To Structure

- Desk View capture
- OpenCV cleanup
- Transcript grounded planning
- Draft before generation

---

# Workflow

Sketch and voice become a reviewable plan before any external generation runs.

---

# Output

Slidev web preview and PPTX export are produced from the same source markdown.
`;
}

function fallbackMermaid(job) {
  const intent = String(job.prompt || '').trim();
  const intentLabel = intent ? intent.slice(0, 28) : 'Intent';
  return `flowchart TD
  A[Desk View sketch] --> B[Paper crop]
  B --> C[${intentLabel}]
  C --> D{Flow logic}
  D -->|Yes| E[Output path]
  D -->|No| F[Fallback path]
  E --> G[Editable PPTX]
  F --> G`;
}

function extractMermaid(text) {
  const fenced = text.match(/```mermaid\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.match(/(?:^|\n)\s*(flowchart\s+(?:TD|LR)[\s\S]*)/i);
  if (!start) return null;
  return start[1].trim().replace(/```[\s\S]*$/g, '').trim();
}

function flowchartSlidesFromMermaid(mermaid, job) {
  return `---
theme: default
canvasWidth: 1280
highlighter: shiki
title: Paper Studio Flowchart
---

# Paper Studio Flowchart

\`\`\`mermaid
${mermaid}
\`\`\`

<!--
MERMAID_SOURCE
${mermaid}
-->
`;
}

function flowchartSlides(text, job) {
  return flowchartSlidesFromMermaid(extractMermaid(text) || fallbackMermaid(job), job);
}

function extractMarkdown(text, job) {
  if (job.deckOutput === 'flowchart-page') return flowchartSlides(text, job);
  const fence = text.match(/```(?:md|markdown)?\s*([\s\S]*?)```/i);
  const candidate = (fence ? fence[1] : text).trim();
  if (!candidate) return fallbackSlides(job);
  if (candidate.startsWith('---')) return candidate;
  return `---
theme: default
canvasWidth: 1280
highlighter: shiki
title: Paper Studio Prototype
---

${candidate}
`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripQuotes(text) {
  return String(text || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
}

function parseNodeToken(token, nodes) {
  const clean = String(token || '').trim();
  const match = clean.match(/^([A-Za-z0-9_:-]+)\s*(?:\[(.+?)\]|\((.+?)\)|\{(.+?)\})?$/);
  if (!match) {
    const id = clean.replace(/[^A-Za-z0-9_:-]/g, '_') || `N${nodes.size + 1}`;
    if (!nodes.has(id)) nodes.set(id, { id, label: stripQuotes(clean) || id, shape: 'process' });
    return id;
  }
  const id = match[1];
  const label = stripQuotes(match[2] || match[3] || match[4] || id);
  const shape = match[4] ? 'decision' : 'process';
  const existing = nodes.get(id);
  if (!existing || existing.label === id) nodes.set(id, { id, label, shape });
  else if (shape === 'decision') nodes.set(id, { ...existing, shape });
  return id;
}

function parseMermaidFlowchart(mermaidSource) {
  const lines = String(mermaidSource || '')
    .split('\n')
    .map((line) => line.replace(/%%.*$/, '').trim())
    .filter(Boolean);
  const header = lines.find((line) => /^flowchart\s+(TD|LR)/i.test(line)) || 'flowchart TD';
  const direction = /flowchart\s+LR/i.test(header) ? 'LR' : 'TD';
  const nodes = new Map();
  const edges = [];

  for (const line of lines) {
    if (/^flowchart\s+/i.test(line)) continue;
    const edgeMatch =
      line.match(/^(.+?)\s*(?:-->|==>|-.->)\s*\|(.+?)\|\s*(.+)$/) ||
      line.match(/^(.+?)\s*--\s*(.+?)\s*-->\s*(.+)$/) ||
      line.match(/^(.+?)\s*(?:-->|==>|-.->)\s*(.+)$/);
    if (edgeMatch) {
      const from = parseNodeToken(edgeMatch[1], nodes);
      const hasLabel = edgeMatch.length === 4;
      const to = parseNodeToken(hasLabel ? edgeMatch[3] : edgeMatch[2], nodes);
      edges.push({ from, to, label: hasLabel ? stripQuotes(edgeMatch[2]) : '' });
      continue;
    }
    parseNodeToken(line, nodes);
  }

  if (!nodes.size || !edges.length) {
    nodes.set('A', { id: 'A', label: 'Desk View sketch', shape: 'process' });
    nodes.set('B', { id: 'B', label: 'Paper crop', shape: 'process' });
    nodes.set('C', { id: 'C', label: 'Mermaid flowchart', shape: 'process' });
    nodes.set('D', { id: 'D', label: 'Editable PPTX', shape: 'process' });
    edges.push({ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' });
  }

  return { direction, nodes: [...nodes.values()], edges };
}

function layoutLayeredGraph(graph) {
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const levels = new Map();
  const queue = graph.nodes.filter((node) => !incoming.get(node.id)).map((node) => node.id);
  if (!queue.length) queue.push(graph.nodes[0].id);
  for (const id of queue) levels.set(id, 0);
  while (queue.length) {
    const id = queue.shift();
    const nextLevel = (levels.get(id) || 0) + 1;
    for (const to of outgoing.get(id) || []) {
      if (!levels.has(to) || nextLevel > levels.get(to)) {
        levels.set(to, nextLevel);
        queue.push(to);
      }
    }
  }
  for (const node of graph.nodes) {
    if (!levels.has(node.id)) levels.set(node.id, 0);
  }

  const byLevel = new Map();
  for (const node of graph.nodes) {
    const level = levels.get(node.id) || 0;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level).push(node);
  }
  const levelKeys = [...byLevel.keys()].sort((a, b) => a - b);
  const positions = new Map();
  const marginX = 0.75;
  const marginY = 1.1;
  const slideW = 13.333;
  const slideH = 7.5;
  const nodeW = graph.direction === 'LR' ? 2.0 : 2.25;
  const nodeH = 0.72;
  const flowW = slideW - marginX * 2 - nodeW;
  const flowH = slideH - marginY - 0.85 - nodeH;

  for (const [levelIndex, level] of levelKeys.entries()) {
    const nodes = byLevel.get(level);
    nodes.forEach((node, index) => {
      const cross = nodes.length === 1 ? 0.5 : index / (nodes.length - 1);
      const main = levelKeys.length === 1 ? 0.5 : levelIndex / (levelKeys.length - 1);
      const x = graph.direction === 'LR' ? marginX + flowW * main : marginX + flowW * cross;
      const y = graph.direction === 'LR' ? marginY + flowH * cross : marginY + flowH * main;
      positions.set(node.id, { x, y, w: nodeW, h: nodeH });
    });
  }
  return positions;
}

function buildAdjacency(graph) {
  const incoming = new Map(graph.nodes.map((node) => [node.id, []]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) {
    incoming.get(edge.to)?.push(edge);
    outgoing.get(edge.from)?.push(edge);
  }
  return { incoming, outgoing };
}

function chooseBranchNode(graph, outgoing) {
  return graph.nodes.find((node) => node.shape === 'decision' && (outgoing.get(node.id) || []).length >= 2);
}

function primaryChainTo(nodeId, incoming, outgoing) {
  const chain = [nodeId];
  const seen = new Set(chain);
  let current = nodeId;
  while ((incoming.get(current) || []).length === 1) {
    const previous = incoming.get(current)[0].from;
    if (seen.has(previous)) break;
    const previousOutgoing = outgoing.get(previous) || [];
    if (previousOutgoing.length > 1 && previous !== nodeId) break;
    chain.unshift(previous);
    seen.add(previous);
    current = previous;
  }
  return chain;
}

function orderedBranchEdges(edges) {
  return [...edges].sort((a, b) => {
    const rank = (edge) => {
      const label = String(edge.label || '').toLowerCase();
      if (label === 'y' || label === 'yes' || label === '是') return 0;
      if (label === 'n' || label === 'no' || label === '否') return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });
}

function layoutSketchDecisionGraph(graph) {
  const { incoming, outgoing } = buildAdjacency(graph);
  const branchNode = chooseBranchNode(graph, outgoing);
  if (!branchNode) return null;

  const chain = primaryChainTo(branchNode.id, incoming, outgoing);
  if (chain.length < 2) return null;

  const positions = new Map();
  const slideW = 13.333;
  const nodeW = 1.55;
  const nodeH = 0.58;
  const chainY = 1.45;
  const decisionY = 3.05;
  const branchY = 5.05;
  const chainStartX = Math.max(1.05, (slideW - (chain.length - 1) * 2.15 - nodeW) / 2);
  const chainStepX = Math.min(2.25, (slideW - 2.1 - nodeW) / Math.max(1, chain.length - 1));

  chain.forEach((id, index) => {
    const isBranch = id === branchNode.id;
    const previousX = chainStartX + (index - 1) * chainStepX;
    const x = isBranch ? previousX : chainStartX + index * chainStepX;
    positions.set(id, {
      x,
      y: isBranch ? decisionY : chainY,
      w: isBranch ? 1.35 : nodeW,
      h: isBranch ? 0.82 : nodeH,
    });
  });

  const decisionBox = positions.get(branchNode.id);
  const branchEdges = orderedBranchEdges(outgoing.get(branchNode.id) || []);
  const branchCount = branchEdges.length;
  branchEdges.forEach((edge, index) => {
    const spread = Math.min(5.4, Math.max(2.4, (branchCount - 1) * 2.25));
    const offset = branchCount === 1 ? 0 : -spread / 2 + (spread / (branchCount - 1)) * index;
    positions.set(edge.to, {
      x: Math.max(0.75, Math.min(slideW - 0.75 - nodeW, decisionBox.x + decisionBox.w / 2 + offset - nodeW / 2)),
      y: branchY,
      w: nodeW,
      h: nodeH,
    });
  });

  const placed = new Set(positions.keys());
  const fallback = layoutLayeredGraph(graph);
  for (const node of graph.nodes) {
    if (!placed.has(node.id)) positions.set(node.id, fallback.get(node.id));
  }

  return positions;
}

function layoutGraph(graph) {
  return layoutSketchDecisionGraph(graph) || layoutLayeredGraph(graph);
}

function center(box) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function portPoint(box, side) {
  if (side === 'left') return { x: box.x, y: box.y + box.h / 2 };
  if (side === 'right') return { x: box.x + box.w, y: box.y + box.h / 2 };
  if (side === 'top') return { x: box.x + box.w / 2, y: box.y };
  return { x: box.x + box.w / 2, y: box.y + box.h };
}

function edgePorts(from, to, direction) {
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (direction === 'LR' || Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0
      ? { fromPort: 'right', toPort: 'left' }
      : { fromPort: 'left', toPort: 'right' };
  }
  return dy >= 0
    ? { fromPort: 'bottom', toPort: 'top' }
    : { fromPort: 'top', toPort: 'bottom' };
}

function dedupePoints(points) {
  return points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > 0.001 || Math.abs(point.y - previous.y) > 0.001;
  });
}

function routePoints(from, to, direction) {
  const { fromPort, toPort } = edgePorts(from, to, direction);
  const start = portPoint(from, fromPort);
  const end = portPoint(to, toPort);
  if (Math.abs(start.x - end.x) < 0.001 || Math.abs(start.y - end.y) < 0.001) {
    return dedupePoints([start, end]);
  }
  if (direction === 'LR' || fromPort === 'left' || fromPort === 'right') {
    const midX = (start.x + end.x) / 2;
    return dedupePoints([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]);
  }
  const midY = (start.y + end.y) / 2;
  return dedupePoints([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]);
}

function assertOrthogonalSegments(routes) {
  for (const points of routes) {
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const diagonal = Math.abs(previous.x - current.x) > 0.001 && Math.abs(previous.y - current.y) > 0.001;
      if (diagonal) throw new Error('Flowchart renderer produced a diagonal segment.');
    }
  }
}

function labelAnchor(points) {
  let best = null;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const length = Math.abs(previous.x - current.x) + Math.abs(previous.y - current.y);
    if (!best || length > best.length) best = { previous, current, length };
  }
  if (!best) return points[0];
  return {
    x: (best.previous.x + best.current.x) / 2,
    y: (best.previous.y + best.current.y) / 2,
  };
}

function shapeForNode(pptx, node) {
  if (node.shape === 'decision') return pptx.ShapeType.diamond;
  return pptx.ShapeType.roundRect;
}

function renderOrthogonalSvg({ graph, positions, routes }) {
  const scale = 90;
  const toPx = (value) => value * scale;
  const pointsToSvg = (points) => points.map((point) => `${toPx(point.x)},${toPx(point.y)}`).join(' ');
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  const includePoint = (point) => {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  };
  for (const node of graph.nodes) {
    const box = positions.get(node.id);
    if (!box) continue;
    includePoint({ x: box.x, y: box.y });
    includePoint({ x: box.x + box.w, y: box.y + box.h });
  }
  for (const points of routes) {
    for (const point of points || []) includePoint(point);
  }
  if (!Number.isFinite(bounds.minX)) {
    bounds.minX = 0;
    bounds.minY = 0;
    bounds.maxX = 10;
    bounds.maxY = 5;
  }
  const padding = 0.45;
  const viewBox = [
    toPx(bounds.minX - padding),
    toPx(bounds.minY - padding),
    toPx(bounds.maxX - bounds.minX + padding * 2),
    toPx(bounds.maxY - bounds.minY + padding * 2),
  ].join(' ');
  const edges = graph.edges
    .map((edge, index) => {
      const points = routes[index];
      if (!points) return '';
      const anchor = edge.label ? labelAnchor(points) : null;
      return `
        <polyline points="${pointsToSvg(points)}" fill="none" stroke="#64748b" stroke-width="2.2" marker-end="url(#arrow)" />
        ${anchor ? `<g><rect x="${toPx(anchor.x) - 34}" y="${toPx(anchor.y) - 13}" width="68" height="24" rx="5" fill="#f8fafc" stroke="#cbd5e1"/><text x="${toPx(anchor.x)}" y="${toPx(anchor.y) + 4}" text-anchor="middle" font-size="13" fill="#475569">${escapeHtml(edge.label)}</text></g>` : ''}
      `;
    })
    .join('\n');
  const nodes = graph.nodes
    .map((node) => {
      const box = positions.get(node.id);
      if (!box) return '';
      const x = toPx(box.x);
      const y = toPx(box.y);
      const w = toPx(box.w);
      const h = toPx(box.h);
      if (node.shape === 'decision') {
        const points = [
          `${x + w / 2},${y}`,
          `${x + w},${y + h / 2}`,
          `${x + w / 2},${y + h}`,
          `${x},${y + h / 2}`,
        ].join(' ');
        return `<g><polygon points="${points}" fill="#fff" stroke="#cbd5e1" stroke-width="2"/><text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="#111827">${escapeHtml(node.label)}</text></g>`;
      }
      return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#fff" stroke="#cbd5e1" stroke-width="2"/><text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="#111827">${escapeHtml(node.label)}</text></g>`;
    })
    .join('\n');
  return `<svg viewBox="${viewBox}" role="img" aria-label="Orthogonal editable flowchart preview" preserveAspectRatio="xMidYMid meet">
    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="#64748b" />
      </marker>
    </defs>
    ${edges}
    ${nodes}
  </svg>`;
}

async function writeEditableFlowchartPptx({ mermaidSource, pptxPath }) {
  const graph = parseMermaidFlowchart(mermaidSource);
  const positions = layoutGraph(graph);
  const routes = graph.edges.map((edge) => routePoints(positions.get(edge.from), positions.get(edge.to), graph.direction));
  assertOrthogonalSegments(routes);
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Paper Studio';
  pptx.subject = 'Editable Mermaid flowchart';
  pptx.title = 'Paper Studio Flowchart';
  pptx.company = 'Desky';
  pptx.lang = 'zh-CN';
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
    lang: 'zh-CN',
  };

  const slide = pptx.addSlide();
  slide.background = { color: 'F8FAFC' };
  slide.addText('Paper Studio Flowchart', {
    x: 0.55,
    y: 0.25,
    w: 7.5,
    h: 0.35,
    fontFace: 'Aptos Display',
    fontSize: 24,
    bold: true,
    color: '111827',
    margin: 0,
  });
  slide.addText('Generated from editable Mermaid source', {
    x: 8.1,
    y: 0.31,
    w: 4.6,
    h: 0.25,
    fontSize: 9,
    color: '64748B',
    align: 'right',
    margin: 0,
  });

  for (const edge of graph.edges) {
    const route = routes[graph.edges.indexOf(edge)];
    if (!route) continue;
    for (let index = 1; index < route.length; index += 1) {
      const previous = route[index - 1];
      const current = route[index];
      slide.addShape(pptx.ShapeType.line, {
        x: previous.x,
        y: previous.y,
        w: current.x - previous.x,
        h: current.y - previous.y,
        line: { color: '64748B', width: 1.4, endArrowType: index === route.length - 1 ? 'triangle' : undefined },
      });
    }
    if (edge.label) {
      const anchor = labelAnchor(route);
      slide.addText(edge.label, {
        x: anchor.x - 0.6,
        y: anchor.y - 0.16,
        w: 1.2,
        h: 0.26,
        fontSize: 9,
        color: '475569',
        align: 'center',
        margin: 0.02,
        fill: { color: 'F8FAFC', transparency: 8 },
      });
    }
  }

  for (const node of graph.nodes) {
    const box = positions.get(node.id);
    if (!box) continue;
    slide.addShape(shapeForNode(pptx, node), {
      ...box,
      rectRadius: 0.08,
      fill: { color: 'FFFFFF' },
      line: { color: 'CBD5E1', width: 1.1 },
      shadow: { type: 'outer', color: 'D7DEE9', opacity: 0.18, blur: 1, angle: 45, distance: 1 },
    });
    slide.addText(node.label, {
      x: box.x + 0.12,
      y: box.y + 0.13,
      w: box.w - 0.24,
      h: box.h - 0.18,
      fontSize: 11,
      bold: true,
      color: '111827',
      valign: 'mid',
      align: 'center',
      fit: 'shrink',
      margin: 0.02,
    });
  }

  slide.addNotes(`MERMAID_SOURCE\n${mermaidSource}`);
  await pptx.writeFile({ fileName: pptxPath });
  return pptxPath;
}

async function writeFlowchartPreviewHtml({ distDir, mermaidSource }) {
  await mkdir(distDir, { recursive: true });
  const graph = parseMermaidFlowchart(mermaidSource);
  const positions = layoutGraph(graph);
  const routes = graph.edges.map((edge) => routePoints(positions.get(edge.from), positions.get(edge.to), graph.direction));
  assertOrthogonalSegments(routes);
  const svg = renderOrthogonalSvg({ graph, positions, routes });
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Paper Studio Flowchart</title>
  <style>
    :root { color-scheme: light; font-family: Aptos, -apple-system, BlinkMacSystemFont, "PingFang SC", Arial, sans-serif; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #f7f8fc; }
    body {
      display: grid;
      place-items: center;
      padding: 12px;
      background: #f7f8fc;
    }
    main {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
    }
    .stage {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
    }
    svg { width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>
  <main>
    <section class="stage">
      ${svg}
    </section>
  </main>
</body>
</html>`;
  const htmlPath = path.join(distDir, 'index.html');
  await writeFile(htmlPath, html, 'utf8');
  return { previewPath: htmlPath };
}

async function runSlidevExport({ deckDir, slidesPath, storage, job, mockProviders }) {
  const distDir = path.join(deckDir, 'dist');
  const pptxPath = path.join(deckDir, job.deckOutput === 'flowchart-page' ? 'slidev-deck.pptx' : 'deck.pptx');
  await mkdir(distDir, { recursive: true });

  if (job.deckOutput === 'flowchart-page') {
    const slides = await readFile(slidesPath, 'utf8');
    const mermaidSource = extractMermaid(slides) || extractMermaid(fallbackSlides(job));
    const preview = await writeFlowchartPreviewHtml({ distDir, mermaidSource });
    return {
      previewPath: preview.previewPath,
      pptxPath: null,
      previewUrl: dataUrl(storage, preview.previewPath),
      pptxUrl: null,
    };
  }

  if (mockProviders) {
    const slides = await readFile(slidesPath, 'utf8');
    await writeFile(
      path.join(distDir, 'index.html'),
      `<!doctype html><html><head><meta charset="utf-8"><title>Mock Slidev</title></head><body><pre>${slides
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</pre></body></html>`,
      'utf8',
    );
    await writeFile(pptxPath, 'Mock PPTX export placeholder for smoke tests.\n', 'utf8');
    return {
      previewPath: path.join(distDir, 'index.html'),
      pptxPath,
      previewUrl: dataUrl(storage, path.join(distDir, 'index.html')),
      pptxUrl: dataUrl(storage, pptxPath),
    };
  }

  const slidev = await resolveCommand('slidev', [path.join(process.cwd(), 'node_modules', '.bin', 'slidev')]);
  if (!slidev) throw new Error('Slidev CLI is not installed. Run npm install first.');

  await execFileAsync(slidev, ['build', slidesPath, '--out', distDir], {
    cwd: deckDir,
    timeout: 180000,
    maxBuffer: 1024 * 1024 * 8,
  });
  await execFileAsync(slidev, ['export', slidesPath, '--format', 'pptx', '--output', pptxPath], {
    cwd: deckDir,
    timeout: 180000,
    maxBuffer: 1024 * 1024 * 8,
  });

  return {
    previewPath: path.join(distDir, 'index.html'),
    pptxPath,
    previewUrl: dataUrl(storage, path.join(distDir, 'index.html')),
    pptxUrl: dataUrl(storage, pptxPath),
  };
}

async function generateWithGemini({ job, capture, deckDir, sourceManifest }) {
  const gemini = await resolveCommand('gemini', ['/Users/hmi/.local/bin/gemini']);
  if (!gemini) throw new Error('Gemini CLI is not installed or not on PATH.');
  const outputInstruction =
    job.deckOutput === 'flowchart-page'
      ? 'Use the local image at @input.png. Return Mermaid flowchart source only in stdout.'
      : 'Use the local image at @input.png. Return markdown only in stdout.';
  const prompt = `${deckPrompt({ job, capture, sourceManifest })}

${outputInstruction}`;
  const { stdout } = await execFileAsync(gemini, ['-p', prompt], {
    cwd: deckDir,
    timeout: job.deckOutput === 'flowchart-page' ? FLOWCHART_PROVIDER_TIMEOUT_MS : DECK_PROVIDER_TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 8,
  });
  return stdout;
}

async function generateWithCodex({ job, capture, deckDir, sourceManifest }) {
  const codex = await resolveCommand('codex', ['/Applications/Codex.app/Contents/Resources/codex']);
  if (!codex) throw new Error('Codex CLI is not installed or not on PATH.');
  const outputInstruction =
    job.deckOutput === 'flowchart-page'
      ? 'Read the local image input.png from this job workspace. Return only Mermaid flowchart source in stdout; do not write files.'
      : 'Use the slidev skill if it is available. Read the local image input.png from this job workspace. Create only the Slidev markdown source content for slides.md. Return markdown only in stdout; do not write files.';
  const prompt = `${deckPrompt({ job, capture, sourceManifest })}

${outputInstruction}`;
  const { stdout } = await execFileAsync(
    codex,
    ['exec', '--skip-git-repo-check', '--image', 'input.png', prompt],
    {
      cwd: deckDir,
      timeout: job.deckOutput === 'flowchart-page' ? FLOWCHART_PROVIDER_TIMEOUT_MS : DECK_PROVIDER_TIMEOUT_MS,
      maxBuffer: 1024 * 1024 * 8,
    },
  );
  return stdout;
}

async function generateDeckContent({ job, capture, deckDir, sourceManifest, warnings }) {
  const providers =
    job.deckOutput === 'flowchart-page' && job.deckEngine === 'codex-slidev'
      ? [
          { id: 'gemini-cli', run: generateWithGemini },
          { id: 'codex-slidev', run: generateWithCodex },
        ]
      : job.deckOutput === 'flowchart-page' && job.deckEngine === 'gemini-cli'
        ? [
            { id: 'gemini-cli', run: generateWithGemini },
            { id: 'codex-slidev', run: generateWithCodex },
          ]
        : [
            {
              id: job.deckEngine,
              run: job.deckEngine === 'codex-slidev' ? generateWithCodex : generateWithGemini,
            },
          ];

  let lastError = null;
  for (const provider of providers) {
    try {
      const output = await provider.run({ job, capture, deckDir, sourceManifest });
      if (provider.id !== job.deckEngine) {
        warnings.push(`Flowchart used ${provider.id} because it is the reliable image-reading path for this output.`);
      }
      return { output, providerId: provider.id };
    } catch (error) {
      lastError = error;
      if (job.deckOutput === 'flowchart-page') {
        warnings.push(`${provider.id} failed to read/generate the flowchart. ${compactError(error)}`);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('No deck provider was able to generate output.');
}

export async function runDeckJob({ job, capture, storage, mockProviders = false }) {
  const deckDir = path.join(storage.decksDir, job.id);
  await mkdir(deckDir, { recursive: true });
  const slidesPath = path.join(deckDir, 'slides.md');
  const inputImagePath = path.join(deckDir, 'input.png');
  const inputSourcePath = capture.cleanImagePath || capture.paperCropPath || capture.rawImagePath;
  await copyFile(inputSourcePath, inputImagePath);
  const localCapture = { ...capture, cleanImagePath: inputImagePath };
  const sourceContextUsed = shouldUseSourceContext(job);
  const sourceContextReasonValue = sourceContextReason(job, sourceContextUsed);
  const sourceManifest = sourceContextUsed
    ? mergeSourceManifests(
        job.sourceRoot ? await buildSourceManifest(job.sourceRoot) : null,
        job.sourceSetId ? await readSourceSetManifest(storage, job.sourceSetId) : null,
      )
    : null;

  let rawMarkdown;
  let actualProviderId = job.deckEngine;
  const warnings = [];
  if (mockProviders) {
    rawMarkdown = fallbackSlides(job);
  } else {
    try {
      const generated = await generateDeckContent({
        job,
        capture: localCapture,
        deckDir,
        sourceManifest,
        warnings,
      });
      rawMarkdown = generated.output;
      actualProviderId = generated.providerId;
    } catch (error) {
      if (job.deckOutput !== 'flowchart-page') throw error;
      warnings.push(`All flowchart providers failed; generated a fallback editable flowchart. ${compactError(error)}`);
      rawMarkdown = fallbackMermaid(job);
    }
  }

  let slides;
  let mermaidSource = null;
  if (job.deckOutput === 'flowchart-page') {
    mermaidSource = extractMermaid(rawMarkdown);
    if (!mermaidSource) {
      warnings.push('Flowchart provider did not return valid Mermaid; used best-effort fallback Mermaid.');
      mermaidSource = fallbackMermaid(job);
    }
    slides = flowchartSlidesFromMermaid(mermaidSource, job);
  } else {
    slides = extractMarkdown(rawMarkdown, job);
  }
  await writeFile(slidesPath, slides, 'utf8');
  const exports = await runSlidevExport({ deckDir, slidesPath, storage, job, mockProviders });
  let mermaidPath = null;
  let editablePptxPath = null;
  let editablePptxUrl = null;

  if (job.deckOutput === 'flowchart-page') {
    mermaidPath = path.join(deckDir, 'diagram.mmd');
    await writeFile(mermaidPath, `${mermaidSource}\n`, 'utf8');
    editablePptxPath = path.join(deckDir, 'editable-flowchart.pptx');
    await writeEditableFlowchartPptx({ mermaidSource, pptxPath: editablePptxPath });
    editablePptxUrl = dataUrl(storage, editablePptxPath);
  }

  return {
    providerSession: { providerId: actualProviderId, requestedProviderId: job.deckEngine, mock: mockProviders },
    sourceManifest,
    sourceContextUsed,
    sourceContextReason: sourceContextReasonValue,
    warnings,
    deck: {
      engine: job.deckEngine,
      style: job.deckStyle,
      sketchType: job.sketchType,
      output: job.deckOutput,
      inputImagePath,
      inputImageUrl: dataUrl(storage, inputImagePath),
      slidesPath,
      slidesUrl: dataUrl(storage, slidesPath),
      mermaidSource,
      mermaidPath,
      mermaidUrl: mermaidPath ? dataUrl(storage, mermaidPath) : null,
      previewPath: exports.previewPath,
      previewUrl: exports.previewUrl,
      pptxPath: editablePptxPath || exports.pptxPath,
      pptxUrl: editablePptxUrl || exports.pptxUrl,
      slidevPptxPath: job.deckOutput === 'flowchart-page' ? exports.pptxPath : null,
      slidevPptxUrl: job.deckOutput === 'flowchart-page' ? exports.pptxUrl : null,
      exportFormats: job.exportFormats || ['web', 'pptx'],
    },
  };
}

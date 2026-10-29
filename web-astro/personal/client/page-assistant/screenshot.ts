// 网页视口截图：优先把 DOM 渲染成图片，失败时退回「按块位置绘制」的布局快照。
// 不依赖 getDisplayMedia（局域网纯 HTTP 不是安全上下文），也不截桌面。
import { screenshotTop, type PageSnapshot } from './model.ts';

export type Screenshot = { dataUrl: string; width: number; height: number; kind: 'dom' | 'layout' | 'element' };

const STYLE_PROPS = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'min-width',
  'max-width',
  'margin',
  'padding',
  'border',
  'border-radius',
  'background-color',
  'background-image',
  'background-position',
  'background-size',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-transform',
  'white-space',
  'word-break',
  'overflow-wrap',
  'list-style',
  'box-shadow',
  'opacity',
  'transform',
  'vertical-align',
  'flex',
  'flex-direction',
  'align-items',
  'justify-content',
  'gap',
  'grid-template-columns',
  'object-fit',
];
const REMOVE = 'script,style,link,noscript,iframe,video,audio,canvas,.pa-root,.reading-progress,dialog';

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// cloneNode 不会复制表单控件的当前值（value / checked / selected 是属性，
// 不是 HTML 属性）。考试页的填空和开放题因此会在截图里变成空白框；
// 这里把线上状态补回克隆节点，密码输入不复制。
function copyFormState(original: Element, clone: Element) {
  if (original instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
    const type = original.type.toLowerCase();
    if (type === 'password' || type === 'file' || type === 'hidden') {
      clone.removeAttribute('value');
      clone.removeAttribute('checked');
      return;
    }
    if (type === 'checkbox' || type === 'radio') {
      if (original.checked) clone.setAttribute('checked', '');
      else clone.removeAttribute('checked');
      return;
    }
    clone.setAttribute('value', original.value);
    return;
  }
  if (original instanceof HTMLTextAreaElement && clone instanceof HTMLTextAreaElement) {
    clone.textContent = original.value;
    return;
  }
  if (original instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) {
    Array.from(clone.options).forEach((option, index) => {
      if (original.options[index]?.selected) option.setAttribute('selected', '');
      else option.removeAttribute('selected');
    });
  }
}

function inlineStyles(original: Element, clone: Element) {
  if (!(clone instanceof HTMLElement) && !(clone instanceof SVGElement)) return;
  if (original instanceof Element && (clone instanceof HTMLElement || clone instanceof SVGElement)) {
    const style = getComputedStyle(original);
    for (const prop of STYLE_PROPS) {
      const value = style.getPropertyValue(prop);
      if (value) clone.style.setProperty(prop, value);
    }
    copyFormState(original, clone);
  }
  const originals = Array.from(original.children);
  const clones = Array.from(clone.children);
  for (let index = 0; index < originals.length && index < clones.length; index++) {
    inlineStyles(originals[index], clones[index]);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = src;
  });
}

function scaledSize(width: number, height: number) {
  const scale = Math.min(1, 1280 / Math.max(width, 1), 900 / Math.max(height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function elementSize(width: number, height: number) {
  const scale = Math.min(1, 1280 / Math.max(width, 1), 1600 / Math.max(height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function canvasDataUrl(canvas: HTMLCanvasElement, quality = 0.72, maxChars = 2_800_000): string {
  let data = canvas.toDataURL('image/jpeg', quality);
  if (data.length > maxChars) {
    const smaller = document.createElement('canvas');
    smaller.width = Math.max(1, Math.round(canvas.width * 0.75));
    smaller.height = Math.max(1, Math.round(canvas.height * 0.75));
    const context = smaller.getContext('2d');
    if (context) {
      context.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      data = smaller.toDataURL('image/jpeg', 0.58);
    }
  }
  return data;
}

function screenshotRoot(doc: Document): HTMLElement {
  const main = doc.querySelector<HTMLElement>('main#main-content, main');
  if (!main) throw new Error('no main content for screenshot');
  const rect = main.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) throw new Error('main content not visible');
  return main;
}

function hasInk(context: CanvasRenderingContext2D, width: number, height: number, threshold = 250): boolean {
  const data = context.getImageData(0, 0, width, height).data;
  const base = [data[0], data[1], data[2]];
  let changed = 0;
  for (let index = 0; index < data.length; index += 4 * 37) {
    const diff = Math.abs(data[index] - base[0]) + Math.abs(data[index + 1] - base[1]) + Math.abs(data[index + 2] - base[2]);
    if (diff > 30) changed += 1;
  }
  // 视口整屏是一张图时，data: SVG 里的外部图片加载不出来，只剩背景和分栏线。
  // 阈值放低但不再用个位数命中就通过，宁可退回能画出图注和正文的布局快照。
  return changed >= threshold;
}

async function domScreenshot(snapshot: PageSnapshot, doc: Document): Promise<Screenshot> {
  const root = screenshotRoot(doc);
  const rect = root.getBoundingClientRect();
  const clone = root.cloneNode(true) as HTMLElement;
  inlineStyles(root, clone);
  clone.querySelectorAll(REMOVE).forEach((node) => node.remove());
  clone.style.position = 'absolute';
  clone.style.left = `${Math.max(0, rect.left)}px`;
  // rect.top 已含窗口滚动；内容根自身再滚动时（少数页面）还要减去 root.scrollTop。
  clone.style.top = `${screenshotTop(rect.top, root.scrollTop)}px`;
  clone.style.width = `${Math.max(320, rect.width)}px`;
  clone.style.maxWidth = 'none';
  clone.style.margin = '0';
  clone.style.transform = 'none';
  const background = getComputedStyle(doc.body).backgroundColor || '#fcfcf9';
  const wrapper = doc.createElement('div');
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  wrapper.style.cssText = `position:relative;width:${snapshot.viewport.width}px;height:${snapshot.viewport.height}px;overflow:hidden;background:${background};`;
  wrapper.append(clone);
  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${snapshot.viewport.width}" height="${snapshot.viewport.height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadImage(source);
  const size = scaledSize(snapshot.viewport.width, snapshot.viewport.height);
  const canvas = doc.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (!hasInk(context, canvas.width, canvas.height)) throw new Error('empty render');
  return { dataUrl: canvasDataUrl(canvas), width: size.width, height: size.height, kind: 'dom' };
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of Array.from(paragraph)) {
      const next = line + char;
      if (context.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = char;
        if (lines.length >= maxLines) return lines;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    if (lines.length >= maxLines) return lines;
  }
  return lines;
}

type VisualBlock = { text: string; top: number; height: number; role: string; fontSize: number };

function visualBlocks(root: Element, snapshot: PageSnapshot): VisualBlock[] {
  const selector = 'h1,h2,h3,h4,p,li,pre,table,figure,figcaption,img,button,[class*="flow-node"],[class*="flow-step"]';
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector));
  const selected: HTMLElement[] = [];
  const out: VisualBlock[] = [];
  for (const node of nodes) {
    if (out.length >= 120) break;
    if (node.closest('.pa-root,script,style,noscript,dialog')) continue;
    if (selected.some((parent) => parent !== node && parent.contains(node))) continue;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (rect.bottom < 0 || rect.top > snapshot.viewport.height) continue;
    const text =
      node.tagName === 'IMG'
        ? `[图片${(node as HTMLImageElement).alt ? `：${(node as HTMLImageElement).alt}` : ''}]`
        : (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    selected.push(node);
    const tag = node.tagName.toLowerCase();
    const role = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag) ? 'heading' : tag === 'pre' || tag === 'code' ? 'code' : tag === 'table' ? 'table' : 'paragraph';
    const fontSize = role === 'heading' ? 18 : role === 'code' ? 11 : role === 'table' ? 10 : 13;
    out.push({ text: text.slice(0, 1200), top: rect.top, height: rect.height, role, fontSize });
  }
  return out;
}

function layoutScreenshot(snapshot: PageSnapshot, doc: Document): Screenshot {
  const dark = doc.documentElement.dataset.theme === 'dark';
  const size = scaledSize(snapshot.viewport.width, Math.min(snapshot.viewport.height, 900));
  const scale = size.width / Math.max(1, snapshot.viewport.width);
  const canvas = doc.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.fillStyle = dark ? '#18191c' : '#fcfcf9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = dark ? '#aaadb6' : '#62675d';
  context.font = `600 ${Math.round(11 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.fillText('页面快照 · 当前视口', 12 * scale, 18 * scale);
  const left = 18 * scale;
  const maxWidth = canvas.width - left * 2;
  const selection = snapshot.selection?.text.trim() ?? '';
  let root: Element = doc.body;
  try {
    root = screenshotRoot(doc);
  } catch {
    // 没有 main 的页面（极少数归档页）退回整页，至少能画出当前视口的文字。
  }
  for (const block of visualBlocks(root, snapshot)) {
    const y = Math.max(44, block.top + 26) * scale;
    if (y > canvas.height) break;
    const fontSize = block.fontSize;
    const weight = block.role === 'heading' ? 650 : 400;
    context.font = `${weight} ${Math.max(9, Math.round(fontSize * scale))}px ${block.role === 'code' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'}`;
    context.fillStyle = block.role === 'heading' ? (dark ? '#eeeef0' : '#20231e') : dark ? '#d6d8dd' : '#3b3f36';
    if (selection && block.text.includes(selection.slice(0, 20))) {
      context.fillStyle = dark ? '#33415c' : '#eef6c9';
      context.fillRect(left - 4, y - fontSize * scale, maxWidth + 8, (fontSize + 8) * scale);
      context.fillStyle = dark ? '#eeeef0' : '#20231e';
    }
    if (block.role === 'code') {
      context.fillStyle = dark ? '#222429' : '#f2f3ed';
      context.fillRect(left - 4, y - fontSize * scale, maxWidth + 8, Math.max(16, block.height * scale));
      context.fillStyle = dark ? '#d6d8dd' : '#3b3f36';
    }
    const lines = wrapText(context, block.text, maxWidth, block.role === 'heading' ? 2 : 5);
    lines.forEach((line, index) => context.fillText(line, left, y + index * (fontSize + 4) * scale));
  }
  return { dataUrl: canvasDataUrl(canvas, 0.7), width: size.width, height: size.height, kind: 'layout' };
}


function elementBackground(doc: Document): string {
  return getComputedStyle(doc.body).backgroundColor || '#fcfcf9';
}

async function drawElementImage(image: HTMLImageElement, doc: Document): Promise<Screenshot> {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width < 2 || height < 2) throw new Error('image has no size');
  const size = elementSize(width, height);
  const canvas = doc.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  const background = elementBackground(doc);
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  // The source is a real image, not a foreignObject approximation; sparse line
  // art can have far less than 1% ink, so only reject an entirely blank draw.
  if (!hasInk(context, canvas.width, canvas.height, 10)) throw new Error('empty element');
  return { dataUrl: canvasDataUrl(canvas, 0.82, 2_200_000), width: size.width, height: size.height, kind: 'element' };
}

/**
 * data: SVG wrappers cannot load an <img> whose source is an SVG with
 * foreignObject (the browser shows a broken icon). Fetch the same-origin SVG
 * and inline it, so the clone renders the figure instead of its URL.
 */
async function inlineFigureImages(original: Element, clone: Element) {
  const originals = Array.from(original.querySelectorAll('img'));
  const clones = Array.from(clone.querySelectorAll('img'));
  for (let index = 0; index < Math.min(originals.length, clones.length); index++) {
    const src = originals[index].currentSrc || originals[index].src;
    if (!src || !src.toLowerCase().includes('.svg')) continue;
    try {
      const response = await fetch(src, { credentials: 'same-origin' });
      if (!response.ok) continue;
      const text = await response.text();
      const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
      const svg = parsed.documentElement;
      if (!svg || svg.tagName.toLowerCase() !== 'svg') continue;
      const rect = originals[index].getBoundingClientRect();
      svg.setAttribute('width', String(Math.max(1, Math.round(rect.width))));
      svg.setAttribute('height', String(Math.max(1, Math.round(rect.height))));
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      clones[index].replaceWith(document.importNode(svg, true));
    } catch {
      // keep the original img; the outer hasInk check will reject a blank result
    }
  }
}

async function cloneElementScreenshot(element: Element, rect: DOMRect, doc: Document): Promise<Screenshot> {
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const clone = element.cloneNode(true) as HTMLElement;
  inlineStyles(element, clone);
  await inlineFigureImages(element, clone);
  clone.querySelectorAll(REMOVE).forEach((node) => node.remove());
  clone.style.position = 'absolute';
  clone.style.left = '0';
  clone.style.top = '0';
  clone.style.width = `${width}px`;
  clone.style.maxWidth = 'none';
  clone.style.margin = '0';
  clone.style.transform = 'none';
  const background = elementBackground(doc);
  const wrapper = doc.createElement('div');
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  wrapper.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${background};`;
  wrapper.append(clone);
  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadImage(source);
  const size = elementSize(width, height);
  const canvas = doc.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (!hasInk(context, canvas.width, canvas.height, 20)) throw new Error('empty element');
  return { dataUrl: canvasDataUrl(canvas, 0.82, 2_200_000), width: size.width, height: size.height, kind: 'element' };
}

/**
 * Capture a single figure or table. A figure with one loaded image is drawn
 * directly (the reliable path for same-origin SVG/PNG); everything else is
 * cloned and rendered through foreignObject. Failures fall back to the caller.
 */
export async function captureElement(element: Element, doc: Document = document): Promise<Screenshot> {
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) throw new Error('element not visible');
  const images = element.tagName === 'FIGURE' ? Array.from(element.querySelectorAll('img')) : [];
  const image = images.length === 1 ? images[0] : null;
  if (image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0) {
    try {
      return await timeout(drawElementImage(image, doc), 2500);
    } catch {
      // fall through to the DOM clone
    }
  }
  return timeout(cloneElementScreenshot(element, rect, doc), 4000);
}

export async function captureScreenshot(snapshot: PageSnapshot, doc: Document = document): Promise<Screenshot> {
  try {
    return await timeout(domScreenshot(snapshot, doc), 4000);
  } catch {
    return layoutScreenshot(snapshot, doc);
  }
}

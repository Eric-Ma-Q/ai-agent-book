// Turn closed mermaid fences into SVG after the answer is in the DOM.
// The library is loaded only when an answer actually contains a diagram.
// securityLevel strict plus the global htmlLabels:false keeps labels as SVG
// text. Mermaid 11 ignores flowchart.htmlLabels. The extra check rejects
// script, event handlers and foreignObject before insert.

import { attachDiagramView } from './diagram-view.ts';

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

let loader: Promise<MermaidApi> | null = null;
let sequence = 0;

/** `<br>` is a common habit in node labels. Strict mode would show it as text. */
export function mermaidInput(source: string): string {
  return source.replace(/<br\s*\/?>/gi, '\n');
}

function diagramTheme(): 'dark' | 'neutral' {
  const root = document.documentElement;
  if (root.dataset.theme === 'dark' || root.classList.contains('dark')) return 'dark';
  return 'neutral';
}

function svgIsSafe(svg: string): boolean {
  const lower = svg.toLowerCase();
  if (!lower.includes('<svg')) return false;
  if (lower.includes('<script') || lower.includes('javascript:') || lower.includes('<foreignobject')) return false;
  if (lower.includes('<iframe') || lower.includes('data:text/html')) return false;
  return !/\son[a-z]+\s*=/.test(lower);
}

function loadMermaid(): Promise<MermaidApi> {
  const existing = (globalThis as { mermaid?: MermaidApi }).mermaid;
  if (existing?.render) return Promise.resolve(existing);
  if (loader) return loader;
  loader = (async () => {
    const href = (await import('../vendor/mermaid.min.js?url')).default;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = href;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('mermaid load failed'));
      document.head.append(script);
    });
    const api = (globalThis as { mermaid?: MermaidApi }).mermaid;
    if (!api?.render) throw new Error('mermaid missing');
    return api;
  })();
  loader.catch(() => {
    loader = null;
  });
  return loader;
}

function keepSource(node: HTMLElement, message: string) {
  node.dataset.rendered = 'error';
  const note = document.createElement('p');
  note.className = 'lab-diagram-error';
  note.textContent = message;
  node.before(note);
}

function mountDiagram(svg: string, source: string): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'lab-diagram';
  const canvas = document.createElement('div');
  canvas.className = 'lab-diagram-svg';
  canvas.setAttribute('role', 'group');
  canvas.setAttribute('aria-label', '流程图，捏合放大，双指移动，双击复位');
  const stage = document.createElement('div');
  stage.className = 'lab-diagram-stage';
  stage.innerHTML = svg;
  const drawn = stage.querySelector('svg');
  if (drawn instanceof SVGElement) {
    // Mermaid writes an inline max-width sized to the render pass. The stage
    // width is the fitted size, and the trackpad scale is the only zoom.
    drawn.removeAttribute('width');
    drawn.removeAttribute('height');
    drawn.style.maxWidth = 'none';
    drawn.style.width = '100%';
    drawn.style.height = 'auto';
  }
  canvas.append(stage);

  const tools = document.createElement('div');
  tools.className = 'lab-diagram-tools';
  const hint = document.createElement('p');
  hint.className = 'lab-diagram-hint';
  hint.textContent = '捏合放大，双指移动，双击复位';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'lab-diagram-reset';
  reset.hidden = true;
  reset.textContent = '适合窗口';
  tools.append(hint, reset);

  const details = document.createElement('details');
  details.className = 'lab-diagram-source';
  const summary = document.createElement('summary');
  summary.textContent = '源码';
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = source;
  pre.append(code);
  details.append(summary, pre);
  figure.append(tools, canvas, details);

  const control = attachDiagramView(canvas, stage, (zoomed) => {
    hint.hidden = zoomed;
    reset.hidden = !zoomed;
  });
  reset.addEventListener('click', () => control.reset());
  return figure;
}

export async function hydrateMermaid(root: ParentNode): Promise<void> {
  const nodes = [...root.querySelectorAll('pre.lab-mermaid:not([data-rendered])')].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  if (!nodes.length) return;
  for (const node of nodes) node.dataset.rendered = 'pending';
  let mermaid: MermaidApi;
  try {
    mermaid = await loadMermaid();
  } catch {
    for (const node of nodes) {
      if (node.isConnected) keepSource(node, '流程图没有加载，下面是原文。');
    }
    return;
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    htmlLabels: false,
    theme: diagramTheme(),
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif',
    flowchart: { useMaxWidth: true, curve: 'basis' },
  });
  for (const node of nodes) {
    if (!node.isConnected) continue;
    const source = node.textContent ?? '';
    const id = `pa-diagram-${++sequence}`;
    try {
      const { svg } = await mermaid.render(id, mermaidInput(source));
      document.getElementById(id)?.remove();
      if (!node.isConnected) continue;
      if (!svgIsSafe(svg)) throw new Error('unsafe svg');
      node.replaceWith(mountDiagram(svg, source));
    } catch {
      document.getElementById(id)?.remove();
      if (node.isConnected) keepSource(node, '这张图没有画出来，下面是原文。');
    }
  }
}

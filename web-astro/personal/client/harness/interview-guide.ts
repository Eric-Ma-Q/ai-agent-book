// Requirement 034: progressive enhancement for the guide. Everything here is
// optional: without JS the article, tables and examples still read fine. The
// builder only joins strings in the browser; it never stores or uploads input.

type BuilderFields = {
  template: HTMLSelectElement;
  scene: HTMLInputElement;
  move: HTMLInputElement;
  result: HTMLInputElement;
  method: HTMLInputElement;
};

const PLACEHOLDERS = {
  scene: '【对象】',
  move: '【关键动作】',
  result: '【结果与口径】',
  method: '【可复用方法】',
};

function fill(value: string, fallback: string): string {
  const text = value.trim();
  return text || fallback;
}

const BUILDERS: Record<string, (v: Record<keyof BuilderFields, string>) => string> = {
  result: (v) => `${fill(v.scene, PLACEHOLDERS.scene)}：${fill(v.move, PLACEHOLDERS.move)}，结果${fill(v.result, PLACEHOLDERS.result)}；可复用的做法是${fill(v.method, PLACEHOLDERS.method)}。`,
  growth: (v) => `${fill(v.scene, PLACEHOLDERS.scene)}上，${fill(v.move, PLACEHOLDERS.move)}，带来${fill(v.result, PLACEHOLDERS.result)}；这套方法${fill(v.method, PLACEHOLDERS.method)}。`,
  zero: (v) => `从 0 到 1 做${fill(v.scene, PLACEHOLDERS.scene)}：${fill(v.move, PLACEHOLDERS.move)}，${fill(v.result, PLACEHOLDERS.result)}；沉淀下来的方法是${fill(v.method, PLACEHOLDERS.method)}。`,
};

function mountBuilder(): void {
  const form = document.querySelector<HTMLFormElement>('[data-ig-builder]');
  if (!form) return;
  const template = form.querySelector<HTMLSelectElement>('[data-ig-template]');
  const scene = form.querySelector<HTMLInputElement>('[data-ig-scene]');
  const move = form.querySelector<HTMLInputElement>('[data-ig-move]');
  const result = form.querySelector<HTMLInputElement>('[data-ig-result]');
  const method = form.querySelector<HTMLInputElement>('[data-ig-method]');
  const output = form.querySelector<HTMLElement>('[data-ig-output]');
  const status = form.querySelector<HTMLElement>('[data-ig-status]');
  const copy = form.querySelector<HTMLButtonElement>('[data-ig-copy]');
  if (!template || !scene || !move || !result || !method || !output) return;

  const render = (): void => {
    const builder = BUILDERS[template.value] ?? BUILDERS.result;
    output.textContent = builder({
      template: template.value,
      scene: scene.value,
      move: move.value,
      result: result.value,
      method: method.value,
    });
    if (status) status.textContent = '';
  };

  form.addEventListener('input', render);
  form.addEventListener('change', render);
  form.addEventListener('submit', (event) => event.preventDefault());

  if (copy) {
    copy.addEventListener('click', async () => {
      const text = output.textContent?.trim() || '';
      if (!text) return;
      let copied = false;
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (!copied) {
        const range = document.createRange();
        range.selectNodeContents(output);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      if (status) {
        status.textContent = copied
          ? '已复制。数字与口径要能自己解释。'
          : '已选中，按 ⌘C / Ctrl+C 复制。';
      }
    });
  }

  render();
}

function mountToc(): void {
  const toc = document.querySelector<HTMLElement>('[data-ig-toc]');
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-ig-section]'));
  if (!toc || !sections.length) return;
  const links = new Map<string, HTMLAnchorElement>();
  toc.querySelectorAll<HTMLAnchorElement>('[data-ig-toc-link]').forEach((link) => {
    const id = link.dataset.igTocLink;
    if (id) links.set(id, link);
  });
  if (!links.size) return;

  let frame = 0;
  const update = (): void => {
    frame = 0;
    let current = sections[0]?.id ?? '';
    for (const section of sections) {
      // scroll-margin-top (108) plus the sticky header (~92) leaves a section about
      // 200px below the viewport top after scrollIntoView; keep a little slack.
      if (section.getBoundingClientRect().top <= 220) current = section.id;
    }
    // At the very bottom the last section may start above the fold but never
    // reach the threshold; mark it anyway so the toc does not lag a section.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = sections[sections.length - 1]?.id ?? current;
    }
    links.forEach((link, id) => {
      if (id === current) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };
  const schedule = (): void => {
    if (frame) return;
    frame = window.requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
}

function mountPrint(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-ig-print]').forEach((button) => {
    button.addEventListener('click', () => window.print());
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    mountBuilder();
    mountToc();
    mountPrint();
  }, { once: true });
} else {
  mountBuilder();
  mountToc();
  mountPrint();
}

// 「检查一下」卡片：把回答末尾的 check 围栏换成一道可作答的题。
// 题干只从 textContent 取，渲染时不拼 HTML。

export function checkQuestion(source: string): string {
  const text = (source ?? '').replace(/\r\n?/g, '\n').trim();
  const stripped = text.replace(/^\s*(?:问题|题目|问)[:：]\s*/, '');
  return stripped
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 300);
}

export function hydrateChecks(root: ParentNode, onAnswer: () => void): number {
  if (typeof document === 'undefined') return 0;
  let count = 0;
  for (const node of root.querySelectorAll<HTMLElement>('pre.lab-check:not([data-rendered])')) {
    node.dataset.rendered = 'pending';
    const question = checkQuestion(node.textContent ?? '');
    if (!question) {
      node.dataset.rendered = 'error';
      continue;
    }
    const card = document.createElement('section');
    card.className = 'pa-check';
    card.setAttribute('aria-label', '检查题');

    const head = document.createElement('div');
    head.className = 'pa-check-head';
    const badge = document.createElement('span');
    badge.className = 'pa-check-badge';
    badge.textContent = '检查一下';
    const hint = document.createElement('span');
    hint.className = 'pa-check-hint';
    hint.textContent = '先在下面用自己的话回答，我再对照原文判卷';
    head.append(badge, hint);

    const text = document.createElement('p');
    text.className = 'pa-check-question';
    text.textContent = question;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pa-check-answer';
    button.textContent = '作答';
    button.addEventListener('click', onAnswer);

    card.append(head, text, button);
    node.replaceWith(card);
    count += 1;
  }
  return count;
}

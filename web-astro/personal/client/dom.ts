// Tiny DOM helpers. Text always goes through textContent, so quotes and notes
// can contain any characters without being interpreted as markup.
type Child = Node | string | null | false | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.append(...children.filter((child): child is Node | string => Boolean(child)));
  return element;
}

export function button(label: string, className: string, onClick: () => void) {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text split into plain strings and <mark> nodes for every search term hit. */
export function markTerms(text: string, terms: string[]): (Node | string)[] {
  if (!terms.length) return [text];
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  return text.split(pattern).map((part, index) =>
    // split() with one capture group puts the matches at the odd positions.
    index % 2 ? el('mark', 'hl-hit', part) : part,
  );
}

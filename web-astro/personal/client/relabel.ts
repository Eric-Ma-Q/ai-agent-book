// The reader's highlight UI says notes are kept "in this browser". With the
// file-backed store that is no longer true, so rewrite those messages in place
// rather than editing the upstream translation catalogs.
const TARGETS = [
  '.highlights-intro',
  '#highlight-status',
  '#highlight-dialog-status',
  '#note-draft-status',
];

export function relabelStorageMessages(pairs: string[][]) {
  const rewrite = (element: Element) => {
    const text = element.textContent ?? '';
    const next = pairs.reduce((value, [from, to]) => value.replaceAll(from, to), text);
    if (next !== text) element.textContent = next;
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target =
        record.target instanceof Element ? record.target : record.target.parentElement;
      if (target) rewrite(target);
    }
  });
  for (const selector of TARGETS) {
    const element = document.querySelector(selector);
    if (!element) continue;
    rewrite(element);
    observer.observe(element, { childList: true, characterData: true, subtree: true });
  }
}

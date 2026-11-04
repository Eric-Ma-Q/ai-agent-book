// navigator.clipboard exists only in secure contexts (HTTPS or localhost). On
// the plain-HTTP LAN reader the upstream copy buttons (code blocks, notes
// backup) would always fail, so fall back to the legacy execCommand('copy'),
// which still works there inside a click handler.
type ClipboardHost = { clipboard?: Pick<Clipboard, 'writeText'> };

function copyWithTextarea(doc: Document, text: string) {
  const previous = doc.activeElement as HTMLElement | null;
  const textarea = doc.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  Object.assign(textarea.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0' });
  // Everything outside an open modal dialog is inert and cannot be selected.
  const host = doc.querySelector('dialog[open]') ?? doc.body;
  host.appendChild(textarea);
  try {
    textarea.select();
    if (!doc.execCommand('copy')) throw new Error('Copy failed');
  } finally {
    textarea.remove();
    previous?.focus?.();
  }
}

export function ensureClipboard(nav: ClipboardHost, doc: Document) {
  if (nav.clipboard) return;
  const clipboard = {
    writeText: async (text: string) => copyWithTextarea(doc, text),
  };
  Object.defineProperty(nav, 'clipboard', { value: clipboard, configurable: true });
}

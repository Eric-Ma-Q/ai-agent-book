// Browser-side translator. The author module (src/lib/i18n.ts) eagerly globs
// every locale JSON, which made each page download all 15 language packs even
// though Layout.astro already embedded the current edition's strings in
// #book-ui-messages. This shim keeps the same API for client scripts only; the
// server keeps using the author module for editions and catalogs.
let currentMessages: Record<string, string> | undefined;

export function browserTranslator() {
  if (!currentMessages) {
    try {
      currentMessages = JSON.parse(
        document.getElementById('book-ui-messages')?.textContent ?? '{}',
      );
    } catch {
      currentMessages = {};
    }
  }
  return (message: string) => currentMessages?.[message] ?? message;
}

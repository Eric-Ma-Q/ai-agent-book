// Layout helpers for the page assistant's fullscreen conversation.
// Pure functions only; DOM state stays in page-assistant.ts.

export type ScrollAnchor = { ratio: number; atBottom: boolean };

/**
 * Remember how far the message list was scrolled, not the pixel offset.
 * A wider panel reflows the text and changes scrollHeight, so the raw
 * scrollTop would land on a different paragraph after toggling.
 */
export function scrollAnchor(scrollTop: number, scrollHeight: number, clientHeight: number): ScrollAnchor {
  const max = Math.max(0, scrollHeight - clientHeight);
  if (max <= 0) return { ratio: 1, atBottom: true };
  const ratio = Math.min(1, Math.max(0, scrollTop / max));
  return { ratio, atBottom: ratio >= 0.98 };
}

/** Pixel offset for the new layout. A list that was at the bottom stays there. */
export function scrollTopFor(anchor: ScrollAnchor, scrollHeight: number, clientHeight: number): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  if (anchor.atBottom) return max;
  const ratio = Math.min(1, Math.max(0, anchor.ratio));
  return Math.round(ratio * max);
}

export type EscapeAction = 'back' | 'collapse' | 'close' | 'none';

/** Escape closes the outermost surface first: replay, fullscreen, then the panel. */
export function escapeAction(key: string, open: boolean, fullscreen: boolean, view: 'chat' | 'replay' = 'chat'): EscapeAction {
  if (key !== 'Escape' || !open) return 'none';
  if (view === 'replay') return 'back';
  return fullscreen ? 'collapse' : 'close';
}

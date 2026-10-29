// 随页问答的发送模式：问答、检验、概念图。
// 只放纯函数，`node --test` 可以直接加载。

export type Mode = 'ask' | 'check' | 'map';
export type ChatMode = 'ask' | 'check';

export const MODE_KEY = 'page-assistant:mode';

/** 本机只记住问答 / 检验；概念图是一次性的发送模式，不持久化。 */
export function parseMode(raw: string | null | undefined): ChatMode {
  return raw === 'check' ? 'check' : 'ask';
}

export function modeLabel(mode: ChatMode): string {
  return mode === 'check' ? '检验' : '问答';
}

const CHAPTER = '(?:本章|这一章|整章|全章)';
const MAP_WORD = '(?:概念图|知识地图|结构图|关系图)';

/**
 * 只认「本章 + 概念图」这类明确说法，避免把「这个概念图里的箭头」也切成
 * 概念图模式。章节页之外一律不切。
 */
export function inferConceptMode(question: string, pageType: string): boolean {
  if (pageType !== 'chapter') return false;
  const text = (question ?? '').replace(/\s+/g, '');
  if (!text) return false;
  return new RegExp(`${CHAPTER}.{0,12}${MAP_WORD}|${MAP_WORD}.{0,12}${CHAPTER}`).test(text);
}

/** 显式指定的模式优先，其次是概念图意图，最后才是检验开关。 */
export function resolveSendMode(question: string, selected: ChatMode, pageType: string, explicit?: Mode): Mode {
  if (explicit) return explicit;
  if (inferConceptMode(question, pageType)) return 'map';
  return selected;
}

// 单图 / 单表的候选：只从页面快照里挑 figure 和 table，不发新请求。

import type { FocusTarget, PageBlock, PageSnapshot } from './model.ts';

export type FocusCandidate = {
  block: PageBlock;
  kind: '图' | '表';
  caption: string;
};

export function captionFor(block: PageBlock): string {
  const first = (block.text || '').split('\n')[0]?.trim() ?? '';
  return first.slice(0, 60) || `第 ${block.index} 块`;
}

export function focusLabel(focus: FocusTarget): string {
  const kind = focus.role === 'table' ? '表' : '图';
  return `${kind} · ${focus.caption || `第 ${focus.blockIndex} 块`}`;
}

/** 当前块前后 20 块优先，其余按页面顺序；最多 8 个，避免面板里铺一屏按钮。 */
export function focusCandidates(snapshot: PageSnapshot, limit = 8): FocusCandidate[] {
  const blocks = snapshot.blocks.filter(
    (block) => (block.role === 'figure' || block.role === 'table') && block.text.trim() && block.height > 20,
  );
  const current = snapshot.current.blockIndex ?? 0;
  const near = (block: PageBlock) => Math.abs(block.index - current) <= 20;
  const ordered = [...blocks.filter(near), ...blocks.filter((block) => !near(block))];
  return ordered.slice(0, Math.max(1, limit)).map((block) => ({
    block,
    kind: block.role === 'table' ? '表' : '图',
    caption: captionFor(block),
  }));
}

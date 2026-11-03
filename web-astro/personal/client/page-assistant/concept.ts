// 本章概念图：解析回答里的 concept JSON，做分层布局，渲染成可点的 SVG。
// 解析与布局是纯函数；DOM 只在 hydrateConcepts 里用。

export type ConceptNode = { id: string; label: string; section: string; note: string };
export type ConceptEdge = { from: string; to: string; label: string };
export type ConceptMap = { title: string; nodes: ConceptNode[]; edges: ConceptEdge[] };
export type ConceptEdgeKind = 'adjacent' | 'long' | 'back';

export type ConceptBox = ConceptNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  row: number;
};

export type ConceptEdgeLayout = {
  from: string;
  to: string;
  label: string;
  path: string;
  labelX: number;
  labelY: number;
  labelWidth: number;
  dashed: boolean;
  side: boolean;
  kind: ConceptEdgeKind;
};

export type ConceptLayout = {
  width: number;
  height: number;
  nodes: ConceptBox[];
  edges: ConceptEdgeLayout[];
  leftGutter: number;
  rightGutter: number;
  maxCount: number;
  sideCount: number;
  labelOverlaps: number;
  crossings: number;
  dense: boolean;
};

const MAX_NODES = 12;
const MAX_EDGES = 24;
const NODE_HEIGHT = 58;
const MIN_NODE_WIDTH = 76;
const MAX_NODE_WIDTH = 132;
const H_GAP = 6;
const LANE_HEIGHT = 20;
const LABEL_HEIGHT = 18;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;
const MARGIN = 12;
const SIDE_LANE_GAP = 10;
const CORNER = 8;

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function jsonObject(source: string): Record<string, unknown> | null {
  const raw = (source ?? '').trim();
  if (!raw) return null;
  const candidates = [raw];
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Invalid JSON or a broken edge rejects the whole map; a partial graph misleads more than it helps. */
export function parseConcept(source: string): ConceptMap | null {
  const data = jsonObject(source);
  if (!data) return null;
  const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
  if (rawNodes.length < 2 || rawNodes.length > MAX_NODES) return null;
  const nodes: ConceptNode[] = [];
  const seen = new Set<string>();
  for (const raw of rawNodes) {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    const id = text(record.id, 24);
    const label = text(record.label, 40);
    if (!id || !label || seen.has(id)) return null;
    seen.add(id);
    nodes.push({ id, label, section: text(record.section, 200), note: text(record.note, 80) });
  }
  const rawEdges = Array.isArray(data.edges) ? data.edges : [];
  if (rawEdges.length > MAX_EDGES) return null;
  const edges: ConceptEdge[] = [];
  const edgeKeys = new Set<string>();
  for (const raw of rawEdges) {
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    const from = text(record.from, 24);
    const to = text(record.to, 24);
    if (!from || !to || from === to || !seen.has(from) || !seen.has(to)) return null;
    const key = `${from}->${to}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({ from, to, label: text(record.label, 8) });
  }
  return { title: text(data.title, 80) || '本章概念图', nodes, edges };
}

/** Width estimate that works without a DOM: ASCII is narrower than CJK. */
export function conceptTextWidth(value: string, size: number): number {
  let width = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) width += size * 0.58;
    else if (code >= 0x2e80) width += size;
    else width += size * 0.8;
  }
  return width;
}

export function fitConceptText(value: string, maxWidth: number, size: number): string {
  if (conceptTextWidth(value, size) <= maxWidth) return value;
  let out = '';
  for (const char of Array.from(value)) {
    if (conceptTextWidth(`${out}${char}…`, size) > maxWidth) break;
    out += char;
  }
  return out ? `${out}…` : '…';
}

type GraphMeta = {
  layer: Map<string, number>;
  preds: Map<string, string[]>;
  succs: Map<string, string[]>;
};

function findBackEdges(map: ConceptMap): Set<number> {
  const ids = map.nodes.map((node) => node.id);
  const adjacency = new Map<string, number[]>(ids.map((id) => [id, []]));
  map.edges.forEach((edge, index) => adjacency.get(edge.from)?.push(index));
  const state = new Map<string, 0 | 1 | 2>(ids.map((id) => [id, 0]));
  const back = new Set<number>();
  const visit = (id: string): void => {
    state.set(id, 1);
    for (const index of adjacency.get(id) ?? []) {
      const to = map.edges[index].to;
      const status = state.get(to) ?? 0;
      if (status === 1) back.add(index);
      else if (status === 0) visit(to);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (state.get(id) === 0) visit(id);
  return back;
}

function layerGraph(map: ConceptMap, back: Set<number>): GraphMeta {
  const ids = map.nodes.map((node) => node.id);
  const preds = new Map<string, string[]>(ids.map((id) => [id, []]));
  const succs = new Map<string, string[]>(ids.map((id) => [id, []]));
  map.edges.forEach((edge, index) => {
    if (back.has(index)) return;
    preds.get(edge.to)?.push(edge.from);
    succs.get(edge.from)?.push(edge.to);
  });
  const indegree = new Map<string, number>(ids.map((id) => [id, preds.get(id)?.length ?? 0]));
  const queue = ids.filter((id) => indegree.get(id) === 0);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor];
    for (const to of succs.get(id) ?? []) {
      const next = (indegree.get(to) ?? 0) - 1;
      indegree.set(to, next);
      if (next === 0) queue.push(to);
    }
  }
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const id of queue) {
    for (const to of succs.get(id) ?? []) layer.set(to, Math.max(layer.get(to) ?? 0, (layer.get(id) ?? 0) + 1));
  }
  return { layer, preds, succs };
}

type OrderResult = { layers: string[][]; crossings: number };

function orderLayers(map: ConceptMap, meta: GraphMeta): OrderResult {
  const ids = map.nodes.map((node) => node.id);
  const maxLayer = Math.max(...ids.map((id) => meta.layer.get(id) ?? 0));
  const layers = Array.from({ length: maxLayer + 1 }, () => [] as string[]);
  for (const id of ids) layers[meta.layer.get(id) ?? 0].push(id);
  const position = new Map<string, number>();
  const reindex = (): void => {
    layers.forEach((layer) => layer.forEach((id, index) => position.set(id, index)));
  };
  reindex();

  const down = new Map<string, string[]>(ids.map((id) => [id, []]));
  const up = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of map.edges) {
    if ((meta.layer.get(edge.to) ?? 0) === (meta.layer.get(edge.from) ?? 0) + 1) {
      down.get(edge.from)?.push(edge.to);
      up.get(edge.to)?.push(edge.from);
    }
  }

  const countCrossings = (): number => {
    let total = 0;
    for (let level = 0; level + 1 < layers.length; level++) {
      const pairs: [number, number][] = [];
      for (const from of layers[level]) {
        for (const to of down.get(from) ?? []) pairs.push([position.get(from) ?? 0, layers[level + 1].indexOf(to)]);
      }
      for (let a = 0; a < pairs.length; a++) {
        for (let b = a + 1; b < pairs.length; b++) {
          if ((pairs[a][0] - pairs[b][0]) * (pairs[a][1] - pairs[b][1]) < 0) total += 1;
        }
      }
    }
    return total;
  };

  const sortLayer = (layer: string[], neighbors: Map<string, string[]>): string[] => {
    const scored = layer.map((id, index) => {
      const values = (neighbors.get(id) ?? []).map((neighbor) => position.get(neighbor)).filter((value): value is number => value !== undefined);
      const barycenter = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : index;
      return { id, barycenter, index };
    });
    scored.sort((a, b) => a.barycenter - b.barycenter || a.index - b.index);
    return scored.map((item) => item.id);
  };

  let best = layers.map((layer) => [...layer]);
  let bestCrossings = countCrossings();
  for (let iteration = 0; iteration < 8; iteration++) {
    for (let level = 1; level < layers.length; level++) layers[level] = sortLayer(layers[level], up);
    reindex();
    for (let level = layers.length - 2; level >= 0; level--) layers[level] = sortLayer(layers[level], down);
    reindex();
    const score = countCrossings();
    if (score < bestCrossings) {
      bestCrossings = score;
      best = layers.map((layer) => [...layer]);
    }
    if (bestCrossings === 0) break;
  }
  return { layers: best, crossings: bestCrossings };
}

function orthoPath(x1: number, y1: number, x2: number, y2: number, laneY: number): string {
  if (Math.abs(x2 - x1) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const direction = x2 > x1 ? 1 : -1;
  const radius = Math.min(CORNER, Math.abs(x2 - x1) / 2, Math.abs(laneY - y1), Math.abs(y2 - laneY));
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${laneY - radius}`,
    `Q ${x1} ${laneY} ${x1 + direction * radius} ${laneY}`,
    `L ${x2 - direction * radius} ${laneY}`,
    `Q ${x2} ${laneY} ${x2} ${laneY + radius}`,
    `L ${x2} ${y2}`,
  ].join(' ');
}

function sidePath(
  side: 'left' | 'right',
  gutterX: number,
  x1: number,
  y1: number,
  exitY: number,
  x2: number,
  y2: number,
  entryY: number,
): string {
  const inward = side === 'left' ? 1 : -1;
  const exitDirection = entryY > exitY ? 1 : -1;
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${exitY}`,
    `L ${gutterX + inward * CORNER} ${exitY}`,
    `Q ${gutterX} ${exitY} ${gutterX} ${exitY + exitDirection * CORNER}`,
    `L ${gutterX} ${entryY - exitDirection * CORNER}`,
    `Q ${gutterX} ${entryY} ${gutterX + inward * CORNER} ${entryY}`,
    `L ${x2} ${entryY}`,
    `L ${x2} ${y2}`,
  ].join(' ');
}

/**
 * Back edges are removed before layering, then layers are ordered by barycenter.
 * Adjacent edges get a lane per layer gap for their labels; long and back edges
 * leave through a left/right gutter so they never cross the node block.
 */
export function layoutConcept(map: ConceptMap, width = 360): ConceptLayout {
  const container = Math.max(280, Math.floor(width || 360));
  const ids = map.nodes.map((node) => node.id);
  const nodeById = new Map(map.nodes.map((node) => [node.id, node]));
  const back = findBackEdges(map);
  const meta = layerGraph(map, back);
  const ordered = orderLayers(map, meta);
  const layers = ordered.layers;
  const layer = meta.layer;
  const maxCount = Math.max(...layers.map((group) => group.length));

  const edgeKind: ConceptEdgeKind[] = map.edges.map((edge, index) => {
    const fromLayer = layer.get(edge.from) ?? 0;
    const toLayer = layer.get(edge.to) ?? 0;
    if (back.has(index) || toLayer <= fromLayer) return 'back';
    return toLayer === fromLayer + 1 ? 'adjacent' : 'long';
  });
  const sideIndices = edgeKind.map((kind, index) => (kind === 'adjacent' ? -1 : index)).filter((index) => index >= 0);

  const halfOfLayer = (id: string): number => {
    const group = layers[layer.get(id) ?? 0];
    const index = group.indexOf(id);
    return group.length <= 1 ? 0 : index / (group.length - 1);
  };
  const sideOf = new Map<number, 'left' | 'right'>();
  let leftCount = 0;
  let rightCount = 0;
  const sideOrder = sideIndices.slice().sort((a, b) => {
    const backA = edgeKind[a] === 'back' ? 0 : 1;
    const backB = edgeKind[b] === 'back' ? 0 : 1;
    return backA - backB || a - b;
  });
  for (const index of sideOrder) {
    const edge = map.edges[index];
    let side: 'left' | 'right';
    if (edgeKind[index] === 'back') side = (halfOfLayer(edge.from) + halfOfLayer(edge.to)) / 2 <= 0.5 ? 'left' : 'right';
    else side = leftCount <= rightCount ? 'left' : 'right';
    if (leftCount + rightCount > 0 && Math.abs(leftCount - rightCount) >= 2) side = leftCount < rightCount ? 'left' : 'right';
    sideOf.set(index, side);
    if (side === 'left') leftCount += 1;
    else rightCount += 1;
  }
  const maxSideLabel = (side: 'left' | 'right'): number =>
    sideIndices
      .filter((index) => sideOf.get(index) === side)
      .reduce((max, index) => Math.max(max, conceptTextWidth(map.edges[index].label, 9)), 0);
  const gutterOf = (count: number, labelWidth: number): number =>
    count ? Math.max(28, Math.ceil(10 + (count - 1) * SIDE_LANE_GAP + labelWidth / 2 + 8)) : 0;
  const leftGutter = gutterOf(leftCount, maxSideLabel('left'));
  const rightGutter = gutterOf(rightCount, maxSideLabel('right'));

  let nodeWidth = Math.floor((container - leftGutter - rightGutter - MARGIN * 2 - (maxCount - 1) * H_GAP) / maxCount);
  nodeWidth = Math.max(MIN_NODE_WIDTH, Math.min(MAX_NODE_WIDTH, nodeWidth));
  let canvasWidth = container;
  const minimumWidth = maxCount * nodeWidth + (maxCount - 1) * H_GAP + leftGutter + rightGutter + MARGIN * 2;
  if (minimumWidth > container) canvasWidth = minimumWidth;
  const contentWidth = canvasWidth - leftGutter - rightGutter - MARGIN * 2;
  const rowWidth = maxCount * nodeWidth + (maxCount - 1) * H_GAP;
  const contentLeft = MARGIN + leftGutter + (contentWidth - rowWidth) / 2;

  const boxes: ConceptBox[] = [];
  layers.forEach((group, level) => {
    const groupWidth = group.length * nodeWidth + (group.length - 1) * H_GAP;
    const startX = contentLeft + (rowWidth - groupWidth) / 2;
    group.forEach((id, index) => {
      const node = nodeById.get(id);
      if (!node) return;
      boxes.push({
        id,
        label: node.label,
        section: node.section,
        note: node.note,
        layer: level,
        row: 0,
        x: startX + index * (nodeWidth + H_GAP),
        y: 0,
        width: nodeWidth,
        height: NODE_HEIGHT,
      });
    });
  });
  const boxById = new Map(boxes.map((box) => [box.id, box]));

  // Ports: adjacent and long edges use bottom/top; back edges use top/bottom.
  const bottomOut = new Map<string, number[]>(ids.map((id) => [id, []]));
  const topIn = new Map<string, number[]>(ids.map((id) => [id, []]));
  const topOut = new Map<string, number[]>(ids.map((id) => [id, []]));
  const bottomIn = new Map<string, number[]>(ids.map((id) => [id, []]));
  map.edges.forEach((edge, index) => {
    const kind = edgeKind[index];
    if (kind === 'back') {
      topOut.get(edge.from)?.push(index);
      bottomIn.get(edge.to)?.push(index);
    } else {
      bottomOut.get(edge.from)?.push(index);
      topIn.get(edge.to)?.push(index);
    }
  });
  const sortPorts = (list: number[], key: 'from' | 'to'): number[] => {
    list.sort((a, b) => {
      const sideA = sideOf.get(a);
      const sideB = sideOf.get(b);
      if (sideA && !sideB) return sideA === 'left' ? -1 : 1;
      if (!sideA && sideB) return sideB === 'left' ? 1 : -1;
      if (sideA && sideB && sideA !== sideB) return sideA === 'left' ? -1 : 1;
      const nodeA = boxById.get(map.edges[a][key]);
      const nodeB = boxById.get(map.edges[b][key]);
      return (nodeA?.x ?? 0) + (nodeA?.width ?? 0) / 2 - ((nodeB?.x ?? 0) + (nodeB?.width ?? 0) / 2) || a - b;
    });
    return list;
  };
  for (const list of bottomOut.values()) sortPorts(list, 'to');
  for (const list of topIn.values()) sortPorts(list, 'from');
  for (const list of topOut.values()) sortPorts(list, 'to');
  for (const list of bottomIn.values()) sortPorts(list, 'from');
  const portFraction = (list: number[], index: number): number => (list.indexOf(index) + 1) / (list.length + 1);

  const adjacent: { index: number; x1: number; x2: number; gap: number }[] = [];
  map.edges.forEach((edge, index) => {
    if (edgeKind[index] !== 'adjacent') return;
    const from = boxById.get(edge.from);
    const to = boxById.get(edge.to);
    if (!from || !to) return;
    adjacent.push({
      index,
      x1: from.x + from.width * portFraction(bottomOut.get(edge.from) ?? [], index),
      x2: to.x + to.width * portFraction(topIn.get(edge.to) ?? [], index),
      gap: from.layer,
    });
  });

  const gapItems: number[][] = Array.from({ length: Math.max(0, layers.length - 1) }, () => []);
  for (const item of adjacent) {
    const list = gapItems[item.gap];
    if (list) list.push(item.index);
  }
  const laneOf = new Map<number, number>();
  const gapLanes: number[] = [];
  gapItems.forEach((indices) => {
    const intervals: { index: number; lo: number; hi: number }[] = [];
    for (const index of indices) {
      const item = adjacent.find((entry) => entry.index === index);
      if (!item) continue;
      const expand = Math.ceil(conceptTextWidth(map.edges[index].label, 9) / 2) + 6;
      intervals.push({ index, lo: Math.min(item.x1, item.x2) - expand, hi: Math.max(item.x1, item.x2) + expand });
    }
    const lanes: [number, number][][] = [];
    for (const interval of intervals) {
      let lane = lanes.findIndex((list) => list.every(([lo, hi]) => interval.hi <= lo || interval.lo >= hi));
      if (lane < 0) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane].push([interval.lo, interval.hi]);
      laneOf.set(interval.index, lane);
    }
    gapLanes.push(lanes.length);
  });

  const layerY: number[] = [];
  let cursorY = PAD_TOP;
  layers.forEach((_, level) => {
    layerY[level] = cursorY;
    for (const box of boxes) if (box.layer === level) box.y = cursorY;
    cursorY += NODE_HEIGHT;
    if (level + 1 < layers.length) cursorY += PAD_TOP + (gapLanes[level] ?? 0) * LANE_HEIGHT + PAD_BOTTOM;
  });
  const height = cursorY + 12;

  const gapCenter = (gap: number): number => {
    const top = (layerY[gap] ?? 0) + NODE_HEIGHT;
    const bottom = layerY[gap + 1] ?? top + 40;
    return (top + bottom) / 2;
  };
  const pickGapY = (first: number, second: number): number => {
    const low = Math.max(0, Math.min(first, second));
    const high = Math.min(gapLanes.length - 1, Math.max(first, second));
    if (high < low) return (layerY[0] ?? 0) + NODE_HEIGHT + 20;
    return gapCenter(Math.floor((low + high) / 2));
  };
  const gutterX = (side: 'left' | 'right', index: number): number => {
    const group = sideIndices.filter((candidate) => sideOf.get(candidate) === side);
    const lane = Math.max(0, group.indexOf(index));
    return side === 'left' ? contentLeft - leftGutter + 12 + lane * SIDE_LANE_GAP : contentLeft + rowWidth + 12 + lane * SIDE_LANE_GAP;
  };

  const edges: ConceptEdgeLayout[] = map.edges.map((edge, index) => {
    const kind = edgeKind[index];
    const from = boxById.get(edge.from);
    const to = boxById.get(edge.to);
    const labelWidth = Math.max(18, Math.ceil(conceptTextWidth(edge.label, 9) + 10));
    if (!from || !to) {
      return { from: edge.from, to: edge.to, label: edge.label, path: '', labelX: 0, labelY: 0, labelWidth, dashed: kind === 'back', side: kind !== 'adjacent', kind };
    }
    if (kind === 'adjacent') {
      const item = adjacent.find((entry) => entry.index === index);
      const gap = from.layer;
      const lane = laneOf.get(index) ?? 0;
      const laneY = layerY[gap] + NODE_HEIGHT + PAD_TOP + lane * LANE_HEIGHT + LANE_HEIGHT / 2;
      const targetTop = layerY[gap + 1];
      return {
        from: edge.from,
        to: edge.to,
        label: edge.label,
        path: item ? orthoPath(item.x1, from.y + from.height, item.x2, targetTop, laneY) : '',
        labelX: item ? (item.x1 + item.x2) / 2 : from.x + from.width / 2,
        labelY: laneY,
        labelWidth,
        dashed: false,
        side: false,
        kind,
      };
    }
    const side = sideOf.get(index) ?? 'right';
    const x1 = kind === 'back'
      ? from.x + from.width * portFraction(topOut.get(edge.from) ?? [], index)
      : from.x + from.width * portFraction(bottomOut.get(edge.from) ?? [], index);
    const x2 = kind === 'back'
      ? to.x + to.width * portFraction(bottomIn.get(edge.to) ?? [], index)
      : to.x + to.width * portFraction(topIn.get(edge.to) ?? [], index);
    const gx = gutterX(side, index);
    const fromY = kind === 'back' ? from.y : from.y + from.height;
    const toY = kind === 'back' ? to.y + to.height : to.y;
    const exitY = kind === 'back' ? fromY - 8 : fromY + 8;
    const entryY = kind === 'back' ? toY + 8 : toY - 8;
    const path = sidePath(side, gx, x1, fromY, exitY, x2, toY, entryY);
    const labelY = kind === 'back' ? pickGapY(from.layer - 1, to.layer) : pickGapY(from.layer, to.layer - 1);
    return {
      from: edge.from,
      to: edge.to,
      label: edge.label,
      path,
      labelX: gx,
      labelY,
      labelWidth,
      dashed: kind === 'back',
      side: true,
      kind,
    };
  });

  // Side labels share a narrow gutter: keep them vertically apart.
  const sideLabels = edges.filter((edge) => edge.side && edge.label).sort((a, b) => a.labelY - b.labelY);
  for (let pass = 0; pass < 3; pass++) {
    for (let index = 1; index < sideLabels.length; index++) {
      const previous = sideLabels[index - 1];
      const current = sideLabels[index];
      if (Math.abs(current.labelY - previous.labelY) < LABEL_HEIGHT + 6 && Math.abs(current.labelX - previous.labelX) < 60) {
        current.labelY = previous.labelY + LABEL_HEIGHT + 6;
      }
    }
  }

  const labelBoxes = edges
    .filter((edge) => edge.label)
    .map((edge) => ({ x: edge.labelX - edge.labelWidth / 2, y: edge.labelY - LABEL_HEIGHT / 2, w: edge.labelWidth, h: LABEL_HEIGHT }));
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  let labelOverlaps = 0;
  for (let first = 0; first < labelBoxes.length; first++) {
    for (let second = first + 1; second < labelBoxes.length; second++) {
      if (overlaps(labelBoxes[first], labelBoxes[second])) labelOverlaps += 1;
    }
  }
  for (const label of labelBoxes) {
    for (const box of boxes) {
      if (overlaps(label, { x: box.x, y: box.y, w: box.width, h: box.height })) labelOverlaps += 1;
    }
  }
  const sideCount = edges.filter((edge) => edge.side).length;
  const dense = map.edges.length >= 18 || maxCount >= 5 || sideCount >= 6 || ordered.crossings > 8 || labelOverlaps > 0;

  return {
    width: canvasWidth,
    height,
    nodes: boxes,
    edges,
    leftGutter,
    rightGutter,
    maxCount,
    sideCount,
    labelOverlaps,
    crossings: ordered.crossings,
    dense,
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
let sequence = 0;

function svgEl<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function nodeJump(node: ConceptNode, allowJump: boolean, onJump: (section: string) => void): void {
  if (!allowJump || !node.section) return;
  onJump(node.section);
}

function renderNode(node: ConceptBox, allowJump: boolean, onJump: (section: string) => void): SVGGElement {
  const group = svgEl('g');
  group.setAttribute('class', `pa-concept-node${allowJump && node.section ? ' pa-concept-node--link' : ''}`);
  group.setAttribute('transform', `translate(${node.x} ${node.y})`);
  const title = svgEl('title');
  title.textContent = [node.label, node.note, node.section].filter(Boolean).join(' · ');
  group.append(title);

  const rect = svgEl('rect');
  rect.setAttribute('width', String(node.width));
  rect.setAttribute('height', String(node.height));
  rect.setAttribute('rx', '10');
  group.append(rect);

  const labelSize = node.width >= 96 ? 11 : 10;
  const label = svgEl('text');
  label.setAttribute('class', `pa-concept-label${labelSize === 10 ? ' pa-concept-label--small' : ''}`);
  label.setAttribute('x', String(node.width / 2));
  label.setAttribute('y', '24');
  label.setAttribute('text-anchor', 'middle');
  label.textContent = fitConceptText(node.label, node.width - 10, labelSize);
  group.append(label);

  if (node.section) {
    const section = svgEl('text');
    section.setAttribute('class', 'pa-concept-section');
    section.setAttribute('x', String(node.width / 2));
    section.setAttribute('y', '43');
    section.setAttribute('text-anchor', 'middle');
    section.textContent = fitConceptText(node.section, node.width - 8, 9);
    group.append(section);
  }

  if (allowJump && node.section) {
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'link');
    group.setAttribute('aria-label', `${node.label}，跳到 ${node.section}`);
    const jump = (): void => nodeJump(node, allowJump, onJump);
    group.addEventListener('click', jump);
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        jump();
      }
    });
  }
  return group;
}

function renderRelationshipList(map: ConceptMap): HTMLElement {
  const wrapper = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'pa-concept-rel-title';
  title.textContent = '关系';
  const list = document.createElement('ul');
  list.className = 'pa-concept-rel';
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  for (const edge of map.edges) {
    const item = document.createElement('li');
    const from = document.createElement('strong');
    from.textContent = byId.get(edge.from)?.label ?? edge.from;
    const arrow = document.createElement('span');
    arrow.className = 'pa-concept-rel-label';
    arrow.textContent = edge.label ? ` —${edge.label}→ ` : ' → ';
    const to = document.createElement('strong');
    to.textContent = byId.get(edge.to)?.label ?? edge.to;
    item.append(from, arrow, to);
    list.append(item);
  }
  wrapper.append(title, list);
  return wrapper;
}

export function renderConcept(
  map: ConceptMap,
  width: number,
  onJump: (section: string) => void,
  allowJump = true,
): HTMLElement {
  const layout = layoutConcept(map, width);
  const figure = document.createElement('figure');
  figure.className = `pa-concept${layout.dense ? ' pa-concept--dense' : ''}`;

  const caption = document.createElement('figcaption');
  const title = document.createElement('strong');
  title.textContent = map.title;
  const hint = document.createElement('span');
  const hints: string[] = [];
  const wide = layout.width > width;
  if (wide) hints.push('图较宽，可左右滑动');
  if (layout.dense) hints.push('关系较多，图上只保留结构，完整关系见列表');
  else if (allowJump && map.nodes.some((node) => node.section)) hints.push('点节点跳到对应小节');
  hints.push(`${map.nodes.length} 个节点 · ${map.edges.length} 条关系`);
  hint.textContent = hints.join(' · ');
  caption.append(title, hint);
  figure.append(caption);

  if (layout.dense) {
    const note = document.createElement('p');
    note.className = 'pa-concept-note';
    note.textContent = '这张图的关系较密，边上的文字容易互相遮挡；图里只画结构，每条关系的标签在下方列表里。';
    figure.append(note);
  }

  const canvas = document.createElement('div');
  canvas.className = 'pa-concept-canvas';
  const markerKey = `pa-concept-arrow-${++sequence}`;
  const solidMarkerId = `${markerKey}-solid`;
  const dashedMarkerId = `${markerKey}-dashed`;
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('height', 'auto');
  if (wide) {
    svg.setAttribute('width', String(layout.width));
    svg.style.width = `${layout.width}px`;
    svg.style.maxWidth = 'none';
  } else {
    svg.setAttribute('width', '100%');
  }
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${map.title}，${map.nodes.length} 个节点，${map.edges.length} 条关系`);
  const defs = svgEl('defs');
  const addMarker = (id: string, dashed: boolean): void => {
    const marker = svgEl('marker');
    marker.setAttribute('id', id);
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('refX', '7');
    marker.setAttribute('refY', '4');
    marker.setAttribute('orient', 'auto');
    const arrow = svgEl('path');
    arrow.setAttribute('class', `pa-concept-arrow ${dashed ? 'pa-concept-arrow--dashed' : 'pa-concept-arrow--solid'}`);
    arrow.setAttribute('d', 'M0.6,0.6 L7.6,4 L0.6,7.4 z');
    marker.append(arrow);
    defs.append(marker);
  };
  addMarker(solidMarkerId, false);
  addMarker(dashedMarkerId, true);
  svg.append(defs);

  for (const edge of layout.edges) {
    const path = svgEl('path');
    path.setAttribute('class', `pa-concept-edge${edge.dashed ? ' pa-concept-edge--back' : ''}${edge.kind === 'long' ? ' pa-concept-edge--long' : ''}`);
    path.setAttribute('d', edge.path);
    path.setAttribute('marker-end', `url(#${edge.dashed ? dashedMarkerId : solidMarkerId})`);
    svg.append(path);
  }
  if (!layout.dense) {
    for (const edge of layout.edges) {
      if (!edge.label) continue;
      const group = svgEl('g');
      group.setAttribute('class', 'pa-concept-edge-label');
      const background = svgEl('rect');
      background.setAttribute('x', String(edge.labelX - edge.labelWidth / 2));
      background.setAttribute('y', String(edge.labelY - LABEL_HEIGHT / 2));
      background.setAttribute('width', String(edge.labelWidth));
      background.setAttribute('height', String(LABEL_HEIGHT));
      background.setAttribute('rx', '5');
      const text = svgEl('text');
      text.setAttribute('x', String(edge.labelX));
      text.setAttribute('y', String(edge.labelY + 3));
      text.setAttribute('text-anchor', 'middle');
      text.textContent = edge.label;
      group.append(background, text);
      svg.append(group);
    }
  }
  for (const node of layout.nodes) svg.append(renderNode(node, allowJump, onJump));
  canvas.append(svg);
  figure.append(canvas);

  const details = document.createElement('details');
  details.className = 'pa-concept-list';
  if (layout.dense) details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = layout.dense ? '节点与关系列表' : '列表视图';
  details.append(summary);
  const list = document.createElement('ol');
  for (const node of map.nodes) {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = node.label;
    item.append(label);
    if (node.note) item.append(document.createTextNode(` · ${node.note}`));
    if (node.section) {
      if (allowJump) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'pa-concept-list-link';
        link.textContent = node.section;
        link.title = `跳到 ${node.section}`;
        link.addEventListener('click', () => nodeJump(node, true, onJump));
        item.append(document.createTextNode(' · '), link);
      } else {
        item.append(document.createTextNode(` · ${node.section}`));
      }
    }
    list.append(item);
  }
  details.append(list);
  if (map.edges.length) details.append(renderRelationshipList(map));
  figure.append(details);
  return figure;
}

export function hydrateConcepts(
  root: ParentNode,
  onJump: (section: string) => void,
  options: { allowJump?: boolean } = {},
): number {
  if (typeof document === 'undefined') return 0;
  let count = 0;
  for (const node of root.querySelectorAll<HTMLElement>('pre.lab-concept:not([data-rendered])')) {
    node.dataset.rendered = 'pending';
    const map = parseConcept(node.textContent ?? '');
    if (!map) {
      node.dataset.rendered = 'error';
      const note = document.createElement('p');
      note.className = 'pa-concept-error';
      note.textContent = '这张概念图没有画出来，下面是原文。';
      node.before(note);
      continue;
    }
    const width = node.clientWidth || node.parentElement?.clientWidth || 360;
    node.replaceWith(renderConcept(map, width, onJump, options.allowJump !== false));
    count += 1;
  }
  return count;
}

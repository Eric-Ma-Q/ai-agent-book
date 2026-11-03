// Geometry for the evaluation trend chart: pass rate per run with its Wilson
// interval drawn as a band. Pure, unit tested.
export type TrendPoint = { pass_rate: number; wilson?: [number, number] | number[] | null };
export type Box = { width: number; height: number; pad: number };

export function trendGeometry(points: TrendPoint[], box: Box) {
  const { width, height, pad } = box;
  const n = points.length;
  const x = (i: number) => (n <= 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1));
  const y = (value: number) => pad + (1 - Math.min(Math.max(value, 0), 1)) * (height - 2 * pad);
  const coords = points.map((p, i) => ({ x: x(i), y: y(p.pass_rate) }));
  const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const withBand = points.every((p) => Array.isArray(p.wilson) && p.wilson.length === 2);
  let band = '';
  if (withBand && n) {
    const upper = points.map((p, i) => `${x(i).toFixed(1)},${y((p.wilson as number[])[1]).toFixed(1)}`);
    const lower = points.map((p, i) => `${x(i).toFixed(1)},${y((p.wilson as number[])[0]).toFixed(1)}`).reverse();
    band = `M${upper.join(' L')} L${lower.join(' L')} Z`;
  }
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((value) => ({ value, y: y(value) }));
  return { coords, line, band, ticks };
}

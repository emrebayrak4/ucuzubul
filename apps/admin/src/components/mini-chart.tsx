import { count, dateTime } from "@/lib/format";

interface Point {
  t: string;
  value: number;
}

/**
 * Minimal bar chart for real time-series points (no interpolation, no smoothing).
 * Empty series → explicit "No data" text instead of a flat fake line.
 */
export function MiniBarChart({ title, points, height = 96 }: { title: string; points: Point[]; height?: number }) {
  const total = points.reduce((s, p) => s + p.value, 0);
  const max = Math.max(1, ...points.map((p) => p.value));
  const w = 100 / Math.max(points.length, 1);
  return (
    <figure className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="price text-xs text-text-muted">{points.length ? `${count(total)} total` : ""}</span>
      </figcaption>
      {points.length === 0 ? (
        <div className="grid place-items-center text-xs text-text-muted" style={{ height }}>
          No data points in this range
        </div>
      ) : (
        <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={`${title}: ${points.length} points, ${count(total)} total`}>
          {points.map((p, i) => {
            const h = (p.value / max) * (height - 4);
            return (
              <rect key={p.t} x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={Math.max(h, p.value > 0 ? 1 : 0)} className="fill-primary" rx={0.5}>
                <title>{`${dateTime(p.t)}: ${count(p.value)}`}</title>
              </rect>
            );
          })}
          <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} className="stroke-border" strokeWidth={0.5} />
        </svg>
      )}
    </figure>
  );
}

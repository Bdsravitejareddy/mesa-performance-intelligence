// Radar (spider) chart for profile summaries. Plain SVG, so it renders on the server and scales with its box.
// Each series is one view of the same axes (e.g. self-report vs written context); missing values are skipped
// rather than drawn as zero.
export type RadarSeries = { label: string; values: (number | null)[]; tone: "rose" | "moss" | "gold" | "dusk" };

const TONES: Record<RadarSeries["tone"], string> = { rose: "#a8605a", moss: "#3f6a3d", gold: "#b8862e", dusk: "#4a5d8a" };

export function Radar({ title, axes, series, max, rings = 5, caption }: { title: string; axes: string[]; series: RadarSeries[]; max: number; rings?: number; caption?: string }) {
  const size = 320, centre = size / 2, radius = 104;
  const angle = (index: number) => (Math.PI * 2 * index) / axes.length - Math.PI / 2;
  const point = (index: number, value: number) => [centre + Math.cos(angle(index)) * radius * (value / max), centre + Math.sin(angle(index)) * radius * (value / max)] as const;
  const ring = (fraction: number) => axes.map((_, index) => point(index, max * fraction).join(",")).join(" ");
  const drawable = series.filter((item) => item.values.some((value) => value !== null));
  return <figure className="radar">
    <figcaption><strong>{title}</strong>{drawable.length > 1 && <span className="radar-legend">{drawable.map((item) => <span key={item.label}><i style={{ background: TONES[item.tone] }} />{item.label}</span>)}</span>}</figcaption>
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${title}: ${axes.map((axis, index) => `${axis} ${drawable.map((item) => item.values[index] ?? "no data").join(" / ")}`).join("; ")}`}>
      {Array.from({ length: rings }, (_, index) => <polygon key={index} points={ring((index + 1) / rings)} className="radar-ring" />)}
      {axes.map((_, index) => { const [x, y] = point(index, max); return <line key={index} x1={centre} y1={centre} x2={x} y2={y} className="radar-spoke" />; })}
      {drawable.map((item) => {
        const points = item.values.map((value, index) => (value === null ? null : point(index, Math.max(0, Math.min(max, value)))));
        const shown = points.filter((value): value is readonly [number, number] => value !== null);
        return <g key={item.label}>
          {shown.length >= 3 && <polygon points={shown.map((value) => value.join(",")).join(" ")} fill={TONES[item.tone]} fillOpacity={0.12} stroke={TONES[item.tone]} strokeWidth={2.4} strokeLinejoin="round" />}
          {shown.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={3.4} fill={TONES[item.tone]} />)}
        </g>;
      })}
      {axes.map((axis, index) => {
        const [x, y] = point(index, max * 1.2);
        const anchor = Math.abs(x - centre) < 8 ? "middle" : x > centre ? "start" : "end";
        return <text key={axis} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="radar-axis">{axis.split("\n").map((line, part) => <tspan key={part} x={x} dy={part ? "1.1em" : 0}>{line}</tspan>)}</text>;
      })}
    </svg>
    {caption && <small className="radar-caption">{caption}</small>}
  </figure>;
}

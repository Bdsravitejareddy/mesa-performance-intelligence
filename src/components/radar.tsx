import { cueFor } from "@/lib/cues";

// Radar (spider) chart for profile summaries. Plain SVG for the shape, with HTML axis labels so each can carry a
// hover cue. A value with no evidence is never drawn as zero: the line breaks there and the axis says so.
export type RadarSeries = { label: string; values: (number | null)[]; tone: "rose" | "moss" | "gold" | "dusk" };

const TONES: Record<RadarSeries["tone"], string> = { rose: "#a8605a", moss: "#3f6a3d", gold: "#b8862e", dusk: "#4a5d8a" };
const SIZE = 320, CENTRE = SIZE / 2, RADIUS = 104;

export function Radar({ title, axes, series, max, rings = 5, caption }: { title: string; axes: string[]; series: RadarSeries[]; max: number; rings?: number; caption?: string }) {
  const angle = (index: number) => (Math.PI * 2 * index) / axes.length - Math.PI / 2;
  const point = (index: number, value: number) => [CENTRE + Math.cos(angle(index)) * RADIUS * (value / max), CENTRE + Math.sin(angle(index)) * RADIUS * (value / max)] as const;
  const ring = (fraction: number) => axes.map((_, index) => point(index, max * fraction).join(",")).join(" ");
  const drawable = series.filter((item) => item.values.some((value) => value !== null));
  const empty = axes.map((_, index) => drawable.every((item) => item.values[index] === null || item.values[index] === undefined));
  return <figure className="radar">
    <figcaption><strong>{title}</strong>{drawable.length > 1 && <span className="radar-legend">{drawable.map((item) => { const cue = cueFor(item.label); return <span key={item.label} className={cue ? "cue" : undefined} tabIndex={cue ? 0 : undefined}><i style={{ background: TONES[item.tone] }} />{item.label}{cue && <span className="cue-card" role="tooltip">{cue}</span>}</span>; })}</span>}</figcaption>
    <div className="radar-plot">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${title}: ${axes.map((axis, index) => `${axis.replace(/-?\n/g, "")} ${drawable.map((item) => item.values[index] ?? "no evidence").join(" / ")}`).join("; ")}`}>
        {Array.from({ length: rings }, (_, index) => <polygon key={index} points={ring((index + 1) / rings)} className="radar-ring" />)}
        {axes.map((_, index) => { const [x, y] = point(index, max); return <line key={index} x1={CENTRE} y1={CENTRE} x2={x} y2={y} className={`radar-spoke${empty[index] ? " is-empty" : ""}`} />; })}
        {drawable.map((item) => {
          const points = item.values.map((value, index) => (value === null || value === undefined ? null : point(index, Math.max(0, Math.min(max, value)))));
          const complete = points.every(Boolean);
          // Contiguous runs of present values, wrapping around, drawn as open lines when any value is missing.
          const runs: (readonly [number, number])[][] = [];
          if (!complete) {
            const start = points.findIndex((value) => value === null);
            let run: (readonly [number, number])[] = [];
            for (let step = 1; step <= points.length; step += 1) {
              const value = points[(start + step) % points.length];
              if (value) run.push(value); else { if (run.length) runs.push(run); run = []; }
            }
            if (run.length) runs.push(run);
          }
          return <g key={item.label}>
            {complete ? <polygon points={points.map((value) => value!.join(",")).join(" ")} fill={TONES[item.tone]} fillOpacity={0.12} stroke={TONES[item.tone]} strokeWidth={2.4} strokeLinejoin="round" />
              : runs.filter((run) => run.length > 1).map((run, index) => <polyline key={index} points={run.map((value) => value.join(",")).join(" ")} fill="none" stroke={TONES[item.tone]} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />)}
            {points.map((value, index) => value && <circle key={index} cx={value[0]} cy={value[1]} r={3.4} fill={TONES[item.tone]} />)}
          </g>;
        })}
      </svg>
      {axes.map((axis, index) => {
        const [x, y] = point(index, max * 1.24);
        const side = Math.abs(x - CENTRE) < 8 ? "middle" : x > CENTRE ? "start" : "end";
        const cue = cueFor(axis);
        return <span key={axis} tabIndex={cue ? 0 : -1} className={`radar-axis-label align-${side}${empty[index] ? " is-empty" : ""}`} style={{ left: `${(x / SIZE) * 100}%`, top: `${(y / SIZE) * 100}%` }}>
          {axis.split("\n").map((line, part) => <span key={part}>{line}</span>)}
          {empty[index] && <small>no evidence yet</small>}
          {cue && <span className="cue-card" role="tooltip">{cue}</span>}
        </span>;
      })}
    </div>
    {caption && <small className="radar-caption">{caption}</small>}
  </figure>;
}

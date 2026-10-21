import type { SyncHealth } from "@/lib/lms/sync-health";

export function SyncHealthNotice({ health, compact = false }: { health: SyncHealth; compact?: boolean }) {
  const lastCompleted = health.lastCompletedAt ? new Date(health.lastCompletedAt).toLocaleString() : "never";
  const latest = health.latest;
  const tone = health.level === "ok" ? "info-callout" : "info-callout data-quality-warning";
  return <div className={tone} role="status" data-sync-level={health.level}>
    <strong>Last successful LMS sync: {lastCompleted}</strong>
    {!compact && latest && <span> · Latest run: {latest.status} · {new Date(latest.finished_at ?? latest.started_at).toLocaleString()}{latest.message ? ` · ${latest.message}` : ""}</span>}
    {health.warnings.length > 0 && <ul className="data-quality-list">{health.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
  </div>;
}

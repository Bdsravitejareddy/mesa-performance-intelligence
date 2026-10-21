import { hiddenCriterionGaps, parseCriterionScores } from "@/lib/feedback/criteria";

const fmt = (value: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);

export function CriterionBreakdown({ feedback, overall }: { feedback: string; overall: number | null }) {
  const criteria = parseCriterionScores(feedback);
  if (!criteria.length) return null;
  const gaps = hiddenCriterionGaps(criteria, overall);
  return <div className="criterion-breakdown">
    <small className="criterion-source">Criterion marks read from the official feedback text</small>
    <ul>{criteria.map((item) => <li key={item.label} className={item.percent < 65 ? "criterion-low" : item.percent >= 85 ? "criterion-high" : ""}>
      <span>{item.label}</span><strong>{fmt(item.score)}/{fmt(item.max)}</strong><i style={{ width: `${Math.max(4, item.percent)}%` }} aria-hidden />
    </li>)}</ul>
    {gaps.length > 0 && <p className="criterion-gap" role="note">The overall mark of {fmt(gaps[0].overall)}/100 hides {gaps.length === 1 ? "a lower criterion" : `${gaps.length} lower criteria`}: {gaps.map((gap) => `${gap.label} (${fmt(gap.score)}/${fmt(gap.max)})`).join(", ")}.</p>}
  </div>;
}

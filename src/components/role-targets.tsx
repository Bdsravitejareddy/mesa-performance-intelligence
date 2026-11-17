import { overlapWithPrimary, type LibraryRole } from "@/lib/roles/library";
import { BUCKET_LABELS, BUCKET_OF, STATUS_LABELS, type ReadinessBucket, type RoleReadiness } from "@/lib/roles/readiness";

export function RoleTargets({ readiness, library }: { readiness: RoleReadiness[]; library: LibraryRole[] }) {
  const primary = readiness.filter((item) => item.role.tier === "primary");
  const cross = readiness.filter((item) => item.role.tier === "cross");
  return <>
    <h2 className="role-stage">Stage 1 · Primary targets</h2>
    <div className="role-grid">{primary.map((item) => <RoleCard key={item.role.key} item={item} />)}</div>
    <h2 className="role-stage">Stage 2 · Cross-compatible roles</h2>
    <p className="empty-hint">Roles that share most of their competencies with your primary targets, so evidence you build now carries over.</p>
    <div className="role-grid">{cross.map((item) => <RoleCard key={item.role.key} item={item} overlap={overlapWithPrimary(item.role, library).shared.length} />)}</div>
  </>;
}

function RoleCard({ item, overlap }: { item: RoleReadiness; overlap?: number }) {
  const share = item.skillRequirements ? Math.round((item.evidenced / item.skillRequirements) * 100) : 0;
  const buckets: ReadinessBucket[] = ["shown", "mixed", "not_shown"];
  const inBucket = (bucket: ReadinessBucket) => item.skills.filter((skill) => BUCKET_OF[skill.status] === bucket);
  return <article className="content-panel role-card">
    <header><div><strong>{item.role.name}</strong><small>{benchmarkNote(item.role.postings)}</small></div>{overlap !== undefined && <span className="competency-state state-emerging" title="How much of what this role asks for your primary targets also ask for. It says nothing about what you have shown.">{overlap} of its {item.role.competencies.length} skills also asked for by your primary targets</span>}</header>
    <div className="role-meter" aria-label={`${item.evidenced} of ${item.skillRequirements} skill requirements shown in your work`}><i style={{ width: `${share}%` }} /></div>
    {/* The three counts are of the same rows listed below, so they always add up to the total. */}
    <p className="role-counts">Its postings list <b>{item.skillRequirements}</b> skill requirements: <b>{item.evidenced}</b> shown in your work (fully or partly) · <b>{item.gaps}</b> with low or mixed results · <b>{item.unknown}</b> not yet shown{item.unmapped.length > 0 && <> · plus {item.unmapped.length} requirement{item.unmapped.length === 1 ? "" : "s"} not matched to a tracked skill</>}</p>
    <p className="scope-note">Interview readiness reflects evidenced skills only. Eligibility (experience, degree) is listed separately for you to judge; no offer likelihood is implied.</p>
    <details className="competency-why"><summary>The {item.skillRequirements} skill requirements and your evidence</summary>
      {buckets.map((bucket) => { const rows = inBucket(bucket); return rows.length > 0 && <div key={bucket}><h3>{BUCKET_LABELS[bucket]} ({rows.length})</h3><ul className="role-requirements">{rows.map((requirement, index) => <li key={`${requirement.quote}-${index}`} className={`req-${requirement.status}`}>
        <span className="req-status">{STATUS_LABELS[requirement.status]}{requirement.matched && requirement.matched.total > 1 && requirement.status !== "demonstrated" ? ` · ${requirement.matched.shown} of ${requirement.matched.total} skills shown` : ""}</span><q>{requirement.quote}</q><small>{requirement.kind} · <a className="text-link" href={requirement.source.url} target="_blank" rel="noreferrer noopener">{requirement.source.employer}</a>{requirement.askedBy > 1 ? ` · asked for in ${requirement.askedBy} lines of these postings, counted once` : ""}</small>
      </li>)}</ul></div>; })}
      {item.unmapped.length > 0 && <><h3>Not matched to a tracked skill ({item.unmapped.length}) — not counted above</h3><ul className="role-requirements">{item.unmapped.map((requirement, index) => <li key={`${requirement.quote}-${index}`} className="req-unmapped"><q>{requirement.quote}</q><small>{requirement.kind} · {requirement.source.employer}</small></li>)}</ul></>}
      {item.eligibility.length > 0 && <><h3>Eligibility — check yourself</h3><ul>{item.eligibility.map((requirement, index) => <li key={`${requirement.quote}-${index}`}>{requirement.quote} <small>({requirement.source.employer})</small></li>)}</ul></>}</details>
  </article>;
}

// A role's benchmark is a small sample of postings: say how many, from whom, how old, and what is not recorded.
export function benchmarkNote(postings: { employer: string; retrievedAt: string }[], now = new Date()): string {
  if (!postings.length) return "No postings recorded";
  const oldest = postings.map((posting) => posting.retrievedAt).sort()[0];
  const days = Math.floor((now.getTime() - new Date(`${oldest}T00:00:00Z`).getTime()) / 86_400_000);
  const read = new Date(`${oldest}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  const age = days > 30 ? `postings read on ${read}, ${days} days ago — refresh before relying on it` : `postings read on ${read}`;
  return `A sample of ${postings.length} posting${postings.length === 1 ? "" : "s"} (${[...new Set(postings.map((posting) => posting.employer))].join(", ")}) · ${age} · location, industry and seniority not recorded`;
}

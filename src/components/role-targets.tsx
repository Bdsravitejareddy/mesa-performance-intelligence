import { overlapWithPrimary, type LibraryRole } from "@/lib/roles/library";
import { STATUS_LABELS, type RoleReadiness } from "@/lib/roles/readiness";

export function RoleTargets({ readiness, library }: { readiness: RoleReadiness[]; library: LibraryRole[] }) {
  const primary = readiness.filter((item) => item.role.tier === "primary");
  const cross = readiness.filter((item) => item.role.tier === "cross");
  return <>
    <h2 className="role-stage">Stage 1 · Primary targets</h2>
    <div className="role-grid">{primary.map((item) => <RoleCard key={item.role.key} item={item} />)}</div>
    <h2 className="role-stage">Stage 2 · Cross-compatible roles</h2>
    <p className="empty-hint">Roles that share most of their competencies with your primary targets, so evidence you build now carries over.</p>
    <div className="role-grid">{cross.map((item) => <RoleCard key={item.role.key} item={item} overlap={overlapWithPrimary(item.role, library).share} />)}</div>
  </>;
}

function RoleCard({ item, overlap }: { item: RoleReadiness; overlap?: number }) {
  const share = item.skillRequirements ? Math.round((item.evidenced / item.skillRequirements) * 100) : 0;
  return <article className="content-panel role-card">
    <header><div><strong>{item.role.name}</strong><small>{item.role.postings.map((posting) => posting.employer).join(" · ")} · retrieved {item.role.postings[0]?.retrievedAt}</small></div>{overlap !== undefined && <span className="competency-state state-emerging">{overlap}% overlap</span>}</header>
    <div className="role-meter" aria-label={`${item.evidenced} of ${item.skillRequirements} skill requirements evidenced`}><i style={{ width: `${share}%` }} /></div>
    <p className="role-counts"><b>{item.evidenced}</b> of {item.skillRequirements} skill requirements evidenced · <b>{item.gaps}</b> demonstrated gaps · <b>{item.unknown}</b> without evidence</p>
    <p className="scope-note">Interview readiness reflects evidenced skills only. Eligibility (experience, degree) is listed separately for you to judge; no offer likelihood is implied.</p>
    <details className="competency-why"><summary>Requirements and evidence</summary><ul className="role-requirements">{item.requirements.filter((requirement) => requirement.status !== "eligibility").map((requirement, index) => <li key={`${requirement.quote}-${index}`} className={`req-${requirement.status}`}>
      <span className="req-status">{STATUS_LABELS[requirement.status]}</span><q>{requirement.quote}</q><small>{requirement.kind} · <a className="text-link" href={requirement.source.url} target="_blank" rel="noreferrer noopener">{requirement.source.employer}</a></small>
    </li>)}</ul>
    {item.eligibility.length > 0 && <><h3>Eligibility — check yourself</h3><ul>{item.eligibility.map((requirement, index) => <li key={`${requirement.quote}-${index}`}>{requirement.quote} <small>({requirement.source.employer})</small></li>)}</ul></>}</details>
  </article>;
}

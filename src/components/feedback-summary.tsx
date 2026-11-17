import { structureFeedback, type FeedbackLine } from "@/lib/feedback/structure";

export type AiFeedback = { strengths: string[]; issues: string[] };

// Feedback on one piece of work, readable at a glance: what to work on and what went well, faculty first, the AI
// grader's points apart and labelled as not official. The original text stays one click away.
export function FeedbackSummary({ feedback, source, ai }: { feedback: string; source: string; ai: AiFeedback | null }) {
  const { points } = structureFeedback(feedback);
  const improve = points.filter((point) => point.kind === "improve");
  const strengths = points.filter((point) => point.kind === "strength");
  const notes = points.filter((point) => point.kind === "note");
  const aiIssues = ai?.issues.filter(Boolean).slice(0, 4) ?? [];
  const aiStrengths = ai?.strengths.filter(Boolean).slice(0, 2) ?? [];
  if (!points.length && !aiIssues.length && !aiStrengths.length) return feedback.trim() ? <p className="feedback-plain">{feedback}</p> : <p className="scope-note">No official feedback recorded.</p>;
  return <div className="feedback-summary">
    {points.length > 0 && <div className="feedback-columns">
      <FeedbackList title="To work on" who={facultyLabel(source)} tone="improve" lines={improve} empty="Faculty listed nothing to work on." />
      <FeedbackList title="Went well" who={facultyLabel(source)} tone="strength" lines={strengths} empty="No strengths listed." />
    </div>}
    {(aiIssues.length > 0 || aiStrengths.length > 0) && <div className="feedback-ai">
      <h4>AI grader <span>not official</span></h4>
      {aiIssues.length > 0 && <ul>{aiIssues.map((text) => <li key={text} className="feedback-line-improve">{text}</li>)}</ul>}
      {aiStrengths.length > 0 && <p className="feedback-ai-strengths">Went well: {aiStrengths.join(" · ")}</p>}
    </div>}
    {(notes.length > 0 || feedback.trim()) && <details className="feedback-original">
      <summary>{notes.length ? `${notes.length} other note${notes.length === 1 ? "" : "s"} and the original text` : "Original text"}</summary>
      {notes.length > 0 && <ul>{notes.map((line, index) => <li key={index}>{line.part ? <small>{line.part} · </small> : null}{line.text}</li>)}</ul>}
      <p className="feedback-plain">{feedback}</p>
    </details>}
  </div>;
}

const facultyLabel = (source: string) => /feedback page/i.test(source) ? "Faculty · Mesa Feedback page" : "Faculty · Nexus";

function FeedbackList({ title, who, tone, lines, empty }: { title: string; who: string; tone: "improve" | "strength"; lines: FeedbackLine[]; empty: string }) {
  return <section className={`feedback-list feedback-list-${tone}`}>
    <h4>{title} <span>{who}</span></h4>
    {lines.length ? <ul>{lines.map((line, index) => <li key={index}>{line.text}{line.part ? <small>{line.part}</small> : null}</li>)}</ul> : <p className="scope-note">{empty}</p>}
  </section>;
}

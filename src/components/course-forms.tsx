"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, LoaderCircle, Plus, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function CourseCreateForm({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [term, setTerm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, code, term }) });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Could not create the course.");
      router.push(`/courses/${result.id}`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the course.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit}>
    <div className="form-row"><label className="field"><span>Course name</span><input required maxLength={160} placeholder="e.g. Strategic Marketing" value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>Course code</span><input maxLength={40} placeholder="e.g. MKT 204" value={code} onChange={(event) => setCode(event.target.value)} /></label></div>
    <label className="field"><span>Term or session</span><input maxLength={80} placeholder="e.g. Term 2 · 2026" value={term} onChange={(event) => setTerm(event.target.value)} /></label>
    {error && <p className="form-error">{error}</p>}
    <button className="button button-primary" type="submit" disabled={disabled || busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} Create course</button>
  </form>;
}

const sourceKinds = [
  ["course_upload", "Other course material"], ["syllabus", "Syllabus / learning objectives"], ["slides", "Lecture slides"],
  ["notes", "Lecture notes"], ["case_study", "Case study / framework"], ["assignment", "Assignment instructions"],
  ["rubric", "Official rubric / marking scheme"], ["reading", "Reference reading"], ["sample_answer", "Sample question / model answer"],
  ["faculty_example", "Faculty example"], ["assessment_paper", "Assessment paper"], ["answer_key", "Answer key"],
] as const;

export function CourseMaterialUploader({ courseId, userId, assessments, demoMode }: { courseId: string; userId?: string; assessments: { id: string; title: string }[]; demoMode: boolean }) {
  const router = useRouter();
  const [sourceKind, setSourceKind] = useState("course_upload");
  const [assessmentId, setAssessmentId] = useState("");
  const [visualNotes, setVisualNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("material-file") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || !userId) return setError("Choose a PDF or PPTX file first.");
    if (file.size > 20 * 1024 * 1024) return setError("Course files must be 20 MB or smaller.");
    const extension = file.name.split(".").at(-1)?.toLowerCase();
    if (extension !== "pdf" && extension !== "pptx") return setError("This MVP accepts PDF and PPTX files.");

    setBusy(true);
    setError("");
    setMessage("");
    let storagePath = "";
    try {
      const supabase = createClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-150);
      storagePath = `${userId}/${courseId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("course-files").upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
      if (uploadError) throw new Error("Private file upload failed. Check the Supabase storage bucket and RLS policy.");
      const response = await fetch("/api/materials/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, assessmentId, storagePath, fileName: file.name, fileSize: file.size, mimeType: file.type, sourceKind, visualNotes }),
      });
      const result = (await response.json()) as { error?: string; pageCount?: number; status?: string };
      if (!response.ok) throw new Error(result.error ?? "The uploaded file could not be indexed.");
      setMessage(`${file.name} indexed across ${result.pageCount ?? 0} pages or slides${result.status === "needs_visual_review" ? ". Add visual notes to complete review." : "."}`);
      form.reset();
      setAssessmentId("");
      setSourceKind("course_upload");
      setVisualNotes("");
      router.refresh();
    } catch (reason) {
      if (storagePath) await createClient().storage.from("course-files").remove([storagePath]).catch(() => undefined);
      setError(reason instanceof Error ? reason.message : "The uploaded file could not be indexed.");
    } finally {
      setBusy(false);
    }
  }

  if (demoMode) return <div className="material-upload upload-disabled"><span className="empty-card-icon"><UploadCloud size={17} /></span><strong>Connect Supabase to upload</strong><p>Preview mode uses synthetic data. Real files stay in your private Supabase bucket after setup.</p></div>;

  return <form className="material-upload" onSubmit={upload}>
    <label className="upload-label" htmlFor="material-file">Upload PDF or PPTX</label>
    <input id="material-file" name="material-file" type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" required />
    <div className="upload-help">Up to 20 MB. Text and tables are indexed with page or slide references. Slides with diagrams are flagged for visual notes.</div>
    <div className="form-row">
      <label className="field"><span>Material type</span><select value={sourceKind} onChange={(event) => setSourceKind(event.target.value)}>{sourceKinds.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field"><span>Link to assessment</span><select value={assessmentId} onChange={(event) => setAssessmentId(event.target.value)}><option value="">Course-wide material</option>{assessments.map((assessment) => <option value={assessment.id} key={assessment.id}>{assessment.title}</option>)}</select></label>
    </div>
    <label className="field"><span>Visual interpretation notes <small>(optional)</small></span><textarea value={visualNotes} onChange={(event) => setVisualNotes(event.target.value)} placeholder="Describe important charts, diagrams, or images in these slides…" /></label>
    {error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}
    <button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <FilePlus2 size={15} />} {busy ? "Uploading and indexing…" : "Upload and index material"}</button>
  </form>;
}

export function AssessmentCreateForm({ courseId, disabled = false }: { courseId: string; disabled?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("written");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/assessments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, title, format }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not create assessment.");
      setTitle("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create assessment.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit}><label className="field"><span>Assessment title</span><input required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Market entry case" /></label><label className="field"><span>Format</span><select value={format} onChange={(event) => setFormat(event.target.value)}><option value="written">Written</option><option value="quantitative">Quantitative</option><option value="case">Case analysis</option><option value="presentation">Presentation</option><option value="project">Project</option><option value="other">Other</option></select></label>{error && <p className="form-error">{error}</p>}<button className="button button-primary" disabled={disabled || busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} Add assessment</button></form>;
}

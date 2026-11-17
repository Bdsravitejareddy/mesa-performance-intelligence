# Mesa Nexus MCP sync contract

## Source and access

The official Nexus MCP page in the authenticated LMS identifies `https://students.mesaschool.co.in/mcp` as the MCP server and demonstrates `mesa-lms.list_assignments`. It exposes 12 tools. Service tokens are user-scoped, revocable, and expire within the offered 7–90 day range. The Vercel secret `NEXUS_MCP_TOKEN` contains the token only; code appends it to the official server path. Do not retrieve it into local files, logs, browser code, or Git.

The dashboard uses the MCP JSON-RPC Streamable HTTP transport, initializes a server session, discovers tool schemas, and calls only assignment/grade collection tools that do not require unknown identifiers. It does not call submit, grade, write, or delete operations. The LMS's observed listing example uses an optional `status` filter; the importer omits optional filters to request the broadest default result. This default must be checked against a real run before claiming full coverage.

## Mapping and integrity

- Course, assessment, and submission IDs use LMS source identifiers for idempotent daily upserts.
- Scores are imported only from explicit earned-score fields (`score`, `earned_marks`, `marks_obtained`, and similar). Maximum-mark fields and status labels never become student scores.
- Marks with an explicit LMS maximum are converted deterministically to the platform's 0–100 scale (`14/20` becomes `70/100`). The raw LMS earned mark and maximum are preserved in separate source fields. If no denominator is available, only an explicit 0–100 score is accepted; other values are left ungraded rather than guessed. Feedback is stored as official LMS feedback with the source labeled `Mesa LMS (Nexus MCP)`.
- Course records link to a unique existing course with the same title; otherwise a new LMS-linked course is created. Ambiguous title matches are not guessed.
- Missing or non-structured results produce a partial sync record with no imported marks. Failed runs preserve previously imported rows. No deletion is inferred from an incomplete response.

## Runtime

`GET /api/cron/lms-sync` is scheduled daily at 03:00 UTC (08:30 India Standard Time) by Vercel Cron and fails closed unless `CRON_SECRET` is configured. The signed-in dashboard has a manual recovery action on Marks & feedback. The manual route rechecks the invited verified account; both invited accounts share the same rows under existing workspace RLS.

Required Production environment variables are `NEXUS_MCP_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_ALLOWED_EMAILS`, and `NEXT_PUBLIC_DEMO_MODE=false`. Secrets must remain server-only.

## Verification boundary

Unit tests cover the MCP handshake/session transport, JSON/SSE handling, read-only tool selection, structured result extraction, score-vs-maximum distinction, denominator-based normalization, original-scale retention, idempotent source keys, and preservation of 0–100 marks. A production run using the configured token imported 44 assessments, five marks, and two feedback records with zero failed reads. It stored Marketing as 90/100 (source 18/20) and Finance as 78.75/100 (source 31.5/40). Seven records remained unlinked because neither list nor assignment-detail results included course references; they were skipped without guessing. A later scheduled run remains unverified until `CRON_SECRET` is configured and Vercel Cron fires successfully.

## Tool inventory (observed 2026-11-05)

The server lists 12 tools: `get_me`, `get_schedule`, `list_courses`, `get_course_content`, `get_material`, `list_assignments`, `get_assignment`, `get_grades`, `get_attendance_summary`, `list_announcements`, `list_notifications` and `delete_notification`. The daily sync reads assignments and grades, course terms, assignment briefs, and — from 2026-11-05 — `list_notifications` and `list_announcements` (no required arguments; `sinceDays`/`limit` set only to a maximum the schema declares; `unreadOnly` omitted). Links in them are classified (Mesa Feedback page, Cohort 4 Quiz Tool, Drive, Nexus, Campus Hub) and stored in `lms_messages`. `delete_notification` is never called. Pages that need the member's Google sign-in (the Feedback page, the Quiz Tool) cannot be fetched with the MCP token; they are flagged for a read in the member's own browser. The real reply shape of the two message tools is parsed tolerantly and must be checked against the first scheduled run.

## `get_grades` reply shape (observed 2026-11-17)

`get_grades` returns `{ reportCards: [...], assignmentMarks: [...] }`. `reportCards[]` holds the term report card shown under Attendance & Grade → Grade (`term`, `program`, `overallGrade`, `gpa`, `cgpa`, `creditsEarned`, `creditsAttempted`, `attendancePct`, `failed`, and `courses[]` with `course`, `credits`, `grade`, `gpa`, `percentage`, `failed`); numbers arrive as strings. `assignmentMarks[]` holds released marks (`assignmentId`, `assignment`, `course`, `marks`, `maxMarks`, `feedback`, `releasedAt`).

From 2026-11-13 the report cards came first, and the record finder took the first non-empty list, so every daily run read 0 marks while reporting success, and sparse upserts blanked stored original scales (e.g. 54.5/80 behind 68.13). Fixed 2026-11-17: only lists whose items name an assignment are read as assignments; a reply with data that yields no assignments, or a run that reads no marks while released marks are stored, makes the run `partial` with a visible warning; mark columns are written only when a mark is reported, and the database trigger keeps a mark and its original scale together. Report cards are stored in `lms_report_cards` (one row per term) and shown on Marks & LMS sync, apart from assessment marks.

## Grade report PDF (observed 2026-11-17)

Attendance & Grade → Grade → **Report card** opens Mesa's official one-page grade report as a PDF on a signed `storage.googleapis.com/mesa_tech_assets/mesa-lms/report-cards/<id>/<id>.pdf` link. Beyond what `get_grades` returns, it holds each course's component breakdown (component, weight %, marks obtained, maximum, "Cumulative · Grade X" with the total) and an Out Class section (e.g. BYOB score out of 10, grade, credits). The MCP does not return it, so it is imported through the member's signed-in browser (`/api/imports/nexus-report-card`: the signed link, fetched server-side and never stored, or an uploaded PDF), parsed by text position, and stored on that term's `lms_report_cards` row. Each course's Σ weight × marks / max is checked against its printed total; a mismatch is shown, never corrected.

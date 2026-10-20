# Mesa Nexus MCP sync contract

## Source and access

The official Nexus MCP page in the authenticated LMS identifies `https://students.mesaschool.co.in/mcp` as the MCP server and demonstrates `mesa-lms.list_assignments`. It exposes 12 tools. Service tokens are user-scoped, revocable, and expire within the offered 7–90 day range. The Vercel secret `NEXUS_MCP_TOKEN` contains the token only; code appends it to the official server path. Do not retrieve it into local files, logs, browser code, or Git.

The dashboard uses the MCP JSON-RPC Streamable HTTP transport, initializes a server session, discovers tool schemas, and calls only assignment/grade collection tools that do not require unknown identifiers. It does not call submit, grade, write, or delete operations. The LMS's observed listing example uses an optional `status` filter; the importer omits optional filters to request the broadest default result. This default must be checked against a real run before claiming full coverage.

## Mapping and integrity

- Course, assessment, and submission IDs use LMS source identifiers for idempotent daily upserts.
- Scores are imported only from explicit earned-score fields (`score`, `earned_marks`, `marks_obtained`, and similar). Maximum-mark fields and status labels never become student scores.
- Official marks remain on the confirmed 0–100 scale. Feedback is stored as official LMS feedback with the source labeled `Mesa LMS (Nexus MCP)`.
- Course records link to a unique existing course with the same title; otherwise a new LMS-linked course is created. Ambiguous title matches are not guessed.
- Missing or non-structured results produce a partial sync record with no imported marks. Failed runs preserve previously imported rows. No deletion is inferred from an incomplete response.

## Runtime

`GET /api/cron/lms-sync` is scheduled daily at 03:00 UTC (08:30 India Standard Time) by Vercel Cron and fails closed unless `CRON_SECRET` is configured. The signed-in dashboard has a manual recovery action on Marks & feedback. The manual route rechecks the invited verified account; both invited accounts share the same rows under existing workspace RLS.

Required Production environment variables are `NEXUS_MCP_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_ALLOWED_EMAILS`, and `NEXT_PUBLIC_DEMO_MODE=false`. Secrets must remain server-only.

## Verification boundary

Unit tests cover the MCP handshake/session transport, JSON/SSE handling, read-only tool selection, structured result extraction, score-vs-maximum distinction, idempotent source keys, and preservation of 0–100 marks. They do not prove production token validity or the Nexus tool output schema. A successful production acceptance run must show structured assignment records, known released scores, matching feedback, and a later scheduled run in Vercel. Until then, imported-record counts and scheduled operation remain unverified.

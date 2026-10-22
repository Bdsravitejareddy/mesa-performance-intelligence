// The prompt members give ChatGPT and each Claude account; the reply's JSON block is what the import reads.
export const PROFILE_PROMPT = `I want an objective, evidence-based profile of how I think, work and communicate, built only from
my own messages in our conversations from the last 30 days. If you cannot see past conversations,
say so and stop rather than guessing. Do not flatter me, do not soften findings, and do not invent.

Rules
- Use only what I wrote. Your own replies are not evidence about me.
- Tag every claim: [Observed] (seen in 2+ conversations, give examples), [Inferred] (a reasonable
  reading of a pattern; say what it rests on) or [Uncertain] (thin or mixed evidence).
- Never conclude from a single instance. Give counter-examples where they exist.
- Describe behaviour in context, not fixed traits; no diagnoses, IQ or personality labels.
- Separate how I approach things from how well; note when context (deadlines, stakeholders,
  audience) changes my behaviour.
- Paraphrase examples briefly with an approximate date; no sensitive personal details.

Cover
1. Scope: roughly how many conversations, date range, main topics, and what you cannot see.
2. Thinking: problem framing, first-principles reasoning, use of evidence and numbers,
   assumptions, trade-offs, decisions under uncertainty, willingness to revise my view.
3. Working style: planning vs iterating, depth vs speed, delegation, follow-through.
4. Communication and stakeholders: directness, objectivity vs accommodation, how I handle
   disagreement and other people's feelings (distinguish "I understand you" from "I agree").
5. Strengths (each with 2+ examples) and development areas (each with 2+ examples).
6. Change over the 30 days: compare the first and second halves; what shifted, when, and
   any feedback I visibly acted on.
7. Blind spots in your view of me, and 3 questions that would confirm or challenge your read.

Finish with this JSON block exactly (keep keys; use [] when unknown):
\`\`\`json
{"source":"chatgpt|claude-personal|claude-team","window_days":30,"conversations_seen":0,
 "findings":[{"area":"thinking|working_style|communication|strength|development|change",
   "claim":"","tag":"Observed|Inferred|Uncertain","examples":[{"date":"YYYY-MM-DD","paraphrase":""}],
   "counter_examples":[{"date":"","paraphrase":""}]}],
 "changes":[{"what":"","from":"","to":"","when":"","evidence":""}],
 "limits":"", "validation_questions":[]}
\`\`\``;

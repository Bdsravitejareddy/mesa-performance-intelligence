// One- or two-line meanings shown on hover for labels across the dashboard.
export const CUES: Record<string, string> = {
  // Skill domains
  "Analytical reasoning": "Breaking problems down and working with numbers and logic to reach sound conclusions.",
  "Business acumen": "Understanding how businesses make money: strategy, finance, economics and business models.",
  "Execution": "Turning plans into delivered results: operations, implementation and prioritising the work.",
  "Communication": "Making ideas clear and persuasive in writing and speech, for the audience in front of you.",
  "Leadership": "Owning outcomes, working well with others and resolving disagreement productively.",
  "Technical capability": "Hands-on tools: SQL, Python, analytics, AI and understanding how systems fit together.",
  "Product thinking": "Finding problems worth solving, understanding users and deciding what to build and measure.",
  "Decision-making": "Making sound calls under ambiguity: weighing risks and trade-offs explicitly.",
  "Creativity": "Generating new ideas and testable hypotheses, and solving problems in non-obvious ways.",
  "Learning agility": "How quickly you learn from new situations and feedback, and apply it — shown by improvement over time.",
  // Personality (IPIP Big Five)
  "Extraversion": "Energy from social settings and comfort taking the floor. Neither end is better.",
  "Agreeableness": "Warmth and accommodation towards others. Lower can mean preferring objective, evidence-led calls.",
  "Conscientiousness": "Preference for order, preparation and follow-through.",
  "Emotional stability": "How steady you stay under stress (the opposite pole of neuroticism).",
  "Intellect": "Interest in ideas, abstraction and imagination — interest, not ability.",
  // Thinking patterns
  "Framing the problem": "Working out what the real problem is, for whom, and what it assumes, before solving it.",
  "Reasoning from fundamentals": "Breaking a problem into its basic drivers and forming ideas you can test.",
  "Working with numbers": "Getting calculations, units and figures right, and checking them.",
  "Weighing evidence": "Noticing evidence against your view, and changing your mind when it should.",
  "Making decisions": "Choosing under uncertainty and constraints, with the trade-offs explicit.",
  "Explaining your thinking": "Making your reasoning easy for someone else to follow.",
  "Learning from feedback": "Acting on feedback you were given in later work. Self-reflection alone does not count.",
  // Overview cards
  "Your average mark": "Your official marks so far, weighted by how much each assessment counts. AI grades are not included.",
  "Best course": "The course with your highest official average so far.",
  "Course to watch": "Your lowest official course average, or one well below your best — a signal to look at, not a verdict.",
  "AI agrees with faculty": "How often the blind AI grade lands within 7.5 points of your official mark — a check on how far to trust AI grades.",
  // Graded work
  "Official": "The mark your faculty gave, from the learning platform.",
  "AI": "A blind AI grade against the assignment brief and course material. It never sees your official mark.",
  "Code": "A tick-list check that each question or task in the brief was attempted. Completeness, not quality.",
  "Marked": "Grades: official marks, and blind AI grades of your submissions where no mark exists yet.",
  "AI view": "The AI's reading of all your evidence — work, feedback, projects, tests and self-report — with quotes.",
  "Holistic": "Marked and AI view combined, using the weights on Rubric & weights.",
  // Evidence and states
  "limited evidence": "One independent source shows this.",
  "moderate evidence": "Two independent sources show this.",
  "substantial evidence": "Three or more independent sources show this.",
  "Demonstrated strength": "High results on at least two different assessments, with no low ones.",
  "Emerging capability": "One high result so far — early positive evidence.",
  "Meets expectations": "Results between the high and low bands.",
  "Demonstrated development area": "Low results on at least two different assessments.",
  "Conflicting evidence": "High and low results disagree; often context-specific.",
  "Insufficient evidence": "Not enough marked evidence to say either way — not a weakness.",
  "Term exam": "Mid-terms, end-terms and graded final submissions; they count most.",
  "Graded work": "Quizzes and named graded assignments.",
  "Practice": "Async tasks, workbooks and session exercises; they count least.",
  // Reasoning sections
  "Numerical": "Working accurately with percentages, ratios, growth and probabilities.",
  "Logical": "Following rules, sequences and deductions to what must be true.",
  "Verbal": "Reading claims precisely: what a passage supports, and what it does not.",
};
export const cueFor = (label: string) => CUES[label.replace(/-?\n/g, (match) => (match.startsWith("-") ? "" : " ")).replace(/\s+/g, " ").trim()] ?? null;

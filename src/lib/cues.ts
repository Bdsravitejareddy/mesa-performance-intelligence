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
  // Reasoning sections
  "Numerical": "Working accurately with percentages, ratios, growth and probabilities.",
  "Logical": "Following rules, sequences and deductions to what must be true.",
  "Verbal": "Reading claims precisely: what a passage supports, and what it does not.",
};
export const cueFor = (label: string) => CUES[label.replace(/-?\n/g, (match) => (match.startsWith("-") ? "" : " ")).replace(/\s+/g, " ").trim()] ?? null;

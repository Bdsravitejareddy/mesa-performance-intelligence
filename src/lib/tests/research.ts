import type { Factor } from "./personality";

// The published research the personality readings rest on. Each finding is a population-level association
// from a peer-reviewed meta-analysis or validation study: it describes averages across many people and is
// never a prediction about one person. Effect sizes in this literature are small to moderate.
export type Study = { key: string; citation: string; url: string };
export const STUDIES: Study[] = [
  { key: "goldberg1992", citation: "Goldberg, L. R. (1992). The development of markers for the Big-Five factor structure. Psychological Assessment, 4(1), 26–42.", url: "https://doi.org/10.1037/1040-3590.4.1.26" },
  { key: "donnellan2006", citation: "Donnellan, M. B., Oswald, F. L., Baird, B. M., & Lucas, R. E. (2006). The Mini-IPIP scales. Psychological Assessment, 18(2), 192–203.", url: "https://doi.org/10.1037/1040-3590.18.2.192" },
  { key: "barrick1991", citation: "Barrick, M. R., & Mount, M. K. (1991). The Big Five personality dimensions and job performance: A meta-analysis. Personnel Psychology, 44(1), 1–26.", url: "https://doi.org/10.1111/j.1744-6570.1991.tb00688.x" },
  { key: "judge2002", citation: "Judge, T. A., Bono, J. E., Ilies, R., & Gerhardt, M. W. (2002). Personality and leadership: A qualitative and quantitative review. Journal of Applied Psychology, 87(4), 765–780.", url: "https://doi.org/10.1037/0021-9010.87.4.765" },
  { key: "poropat2009", citation: "Poropat, A. E. (2009). A meta-analysis of the five-factor model of personality and academic performance. Psychological Bulletin, 135(2), 322–338.", url: "https://doi.org/10.1037/a0014996" },
  { key: "mount1998", citation: "Mount, M. K., Barrick, M. R., & Stewart, G. L. (1998). Five-factor model of personality and performance in jobs involving interpersonal interactions. Human Performance, 11(2–3), 145–165.", url: "https://doi.org/10.1080/08959285.1998.9668029" },
  { key: "soto2019", citation: "Soto, C. J. (2019). How replicable are links between personality traits and consequential life outcomes? Psychological Science, 30(5), 711–727.", url: "https://doi.org/10.1177/0956797619831612" },
  { key: "vazire2010", citation: "Vazire, S. (2010). Who knows what about a person? The self–other knowledge asymmetry (SOKA) model. Journal of Personality and Social Psychology, 98(2), 281–300.", url: "https://doi.org/10.1037/a0017908" },
  { key: "mislevy1986", citation: "Mislevy, R. J. (1986). Bayes modal estimation in item response models. Psychometrika, 51(2), 177–195.", url: "https://doi.org/10.1007/BF02293979" },
  { key: "kahneman1973", citation: "Kahneman, D., & Tversky, A. (1973). On the psychology of prediction. Psychological Review, 80(4), 237–251.", url: "https://doi.org/10.1037/h0034747" },
  { key: "simpson1951", citation: "Simpson, E. H. (1951). The interpretation of interaction in contingency tables. Journal of the Royal Statistical Society: Series B, 13(2), 238–241.", url: "https://doi.org/10.1111/j.2517-6161.1951.tb00088.x" },
  { key: "ipip", citation: "International Personality Item Pool: a scientific collaboratory for personality measures (public-domain items and scoring keys).", url: "https://ipip.ori.org/" },
  { key: "mccrae1989", citation: "McCrae, R. R., & Costa, P. T. (1989). Reinterpreting the Myers-Briggs Type Indicator from the perspective of the five-factor model of personality. Journal of Personality, 57(1), 17–40.", url: "https://doi.org/10.1111/j.1467-6494.1989.tb00759.x" },
  { key: "park2015", citation: "Park, G., Schwartz, H. A., Eichstaedt, J. C., et al. (2015). Automatic personality assessment through social media language. Journal of Personality and Social Psychology, 108(6), 934–952.", url: "https://doi.org/10.1037/pspp0000020" },
];

// What the research associates with each trait, in plain words, with the studies it comes from.
export const FACTOR_RESEARCH: Record<Factor, { strengths: string; watch: string; studies: string[] }> = {
  conscientiousness: {
    strengths: "The most consistent trait correlate of job performance across occupations, and of academic performance independent of intelligence.",
    watch: "Very high scores can come with rigidity when plans need to change quickly.",
    studies: ["barrick1991", "poropat2009"],
  },
  extraversion: {
    strengths: "The strongest trait correlate of leadership emergence, and linked to performance in sales and management roles.",
    watch: "Unrelated to the quality of analytical work; lower scorers are not less capable, they prefer different settings.",
    studies: ["judge2002", "barrick1991"],
  },
  intellect: {
    strengths: "Linked to training proficiency and learning new material, and to leadership; a modest correlate of academic performance.",
    watch: "Reflects interest in ideas, not ability — reasoning and coursework measure ability.",
    studies: ["barrick1991", "judge2002", "poropat2009"],
  },
  agreeableness: {
    strengths: "Predicts performance mainly where cooperation and teamwork are central; weakly related to leadership.",
    watch: "Mixes warmth with going along with others, so it cannot tell evidence-led objectivity apart from low empathy.",
    studies: ["mount1998", "judge2002"],
  },
  neuroticism: {
    strengths: "Lower scores (emotional stability) relate to leadership and steadier performance under pressure.",
    watch: "Self-reports are relatively accurate for this trait, because it is mostly internal and others see less of it.",
    studies: ["judge2002", "vazire2010"],
  },
};

// Why the self-report and the context reading can differ, and why neither is the "true" score.
export const READING_CAVEAT = "Self-reports and readings from what you write measure the same traits only partly: language-based estimates agree with self-reports at a moderate level (Park et al., 2015), and other people are often more accurate than the self on visible, evaluative traits such as intellect, while the self knows internal traits such as anxiety better (Vazire, 2010). Treat a difference as a question worth asking, not an error in either.";

export const citationOf = (key: string) => STUDIES.find((study) => study.key === key)?.citation ?? key;

// What on the page rests on published research, and what is this dashboard's own rule. Shown on the page so no
// reading claims more authority than it has.
export const BASIS: { claim: string; basis: "research" | "own_rule"; detail: string; studies: string[] }[] = [
  { claim: "Questionnaire statements and how they are scored", basis: "research", detail: "Public-domain IPIP Big-Five Factor Markers, with their published scoring keys; reverse-keyed items are reversed.", studies: ["goldberg1992", "ipip", "donnellan2006"] },
  { claim: "What each trait is linked to (job, academic and leadership outcomes)", basis: "research", detail: "Peer-reviewed meta-analyses; population averages with small-to-moderate effects, and a large replication of trait–outcome links.", studies: ["barrick1991", "judge2002", "poropat2009", "mount1998", "soto2019"] },
  { claim: "Why your answers and your written context can differ", basis: "research", detail: "Self and others know different traits best; personality can be estimated from language at a moderate level of agreement with self-report.", studies: ["vazire2010", "park2015"] },
  { claim: "Difficulty-adjusted reasoning score", basis: "research", detail: "A Rasch-type item response model with Bayes modal (prior-weighted) estimation, so perfect or zero scores stay finite.", studies: ["mislevy1986"] },
  { claim: "Base-rate and Simpson's-paradox questions", basis: "research", detail: "Item types follow well-documented reasoning errors: neglecting base rates, and aggregation reversing a within-group comparison.", studies: ["kahneman1973", "simpson1951"] },
  { claim: "How 16Personalities letters line up with the Big Five", basis: "research", detail: "The four type dimensions correspond to extraversion, openness/intellect, agreeableness and conscientiousness; 16Personalities adds identity, which lines up with neuroticism.", studies: ["mccrae1989"] },
  { claim: "16Personalities and CliftonStrengths results", basis: "own_rule", detail: "Both are proprietary, self-reported tools; the dashboard shows your results as context and maps them approximately (a letter alone sits at a moderate lean), never as a measured score.", studies: [] },
  { claim: "Bands such as “high” (4+) and “low” (2 or under)", basis: "own_rule", detail: "Positions on the 1–5 answer scale (agree vs disagree), not norms: no comparison with other people is made.", studies: [] },
  { claim: "The reading from your written context", basis: "own_rule", detail: "An AI reads your note, assistant profiles and coursework patterns, and every score must quote a source. The idea follows language-based assessment research, but this specific method has not been validated.", studies: [] },
  { claim: "Reasoning item difficulties and the 0–100 scale", basis: "own_rule", detail: "Difficulties are set by design, not calibrated on test-takers, and there are no cohort norms yet; the scale is anchored to the questions, not to people.", studies: [] },
  { claim: "Thinking & behaviour patterns and evidence strength", basis: "own_rule", detail: "A working framework of observable behaviours; strength counts independent sources (1 limited, 2 moderate, 3+ substantial). Not a validated instrument.", studies: [] },
  { claim: "The summary sentences and the agreement threshold (0.75 points)", basis: "own_rule", detail: "Fixed wording built from the figures above; the threshold for “agrees” is a convention chosen for this page.", studies: [] },
];

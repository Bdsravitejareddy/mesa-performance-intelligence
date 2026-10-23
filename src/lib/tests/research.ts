import type { Factor } from "./personality";

// The published research the personality readings rest on. Each finding is a population-level association
// from a peer-reviewed meta-analysis or validation study: it describes averages across many people and is
// never a prediction about one person. Effect sizes in this literature are small to moderate.
export type Study = { key: string; citation: string };
export const STUDIES: Study[] = [
  { key: "goldberg1992", citation: "Goldberg, L. R. (1992). The development of markers for the Big-Five factor structure. Psychological Assessment, 4(1), 26–42." },
  { key: "donnellan2006", citation: "Donnellan, M. B., Oswald, F. L., Baird, B. M., & Lucas, R. E. (2006). The Mini-IPIP scales. Psychological Assessment, 18(2), 192–203." },
  { key: "barrick1991", citation: "Barrick, M. R., & Mount, M. K. (1991). The Big Five personality dimensions and job performance: A meta-analysis. Personnel Psychology, 44(1), 1–26." },
  { key: "judge2002", citation: "Judge, T. A., Bono, J. E., Ilies, R., & Gerhardt, M. W. (2002). Personality and leadership: A qualitative and quantitative review. Journal of Applied Psychology, 87(4), 765–780." },
  { key: "poropat2009", citation: "Poropat, A. E. (2009). A meta-analysis of the five-factor model of personality and academic performance. Psychological Bulletin, 135(2), 322–338." },
  { key: "mount1998", citation: "Mount, M. K., Barrick, M. R., & Stewart, G. L. (1998). Five-factor model of personality and performance in jobs involving interpersonal interactions. Human Performance, 11(2–3), 145–165." },
  { key: "soto2019", citation: "Soto, C. J. (2019). How replicable are links between personality traits and consequential life outcomes? Psychological Science, 30(5), 711–727." },
  { key: "vazire2010", citation: "Vazire, S. (2010). Who knows what about a person? The self–other knowledge asymmetry (SOKA) model. Journal of Personality and Social Psychology, 98(2), 281–300." },
  { key: "park2015", citation: "Park, G., Schwartz, H. A., Eichstaedt, J. C., et al. (2015). Automatic personality assessment through social media language. Journal of Personality and Social Psychology, 108(6), 934–952." },
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

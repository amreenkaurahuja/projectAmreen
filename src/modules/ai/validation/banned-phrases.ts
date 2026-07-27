// Lowercase substrings checked against a coaching response's combined text
// (grounding-validator.ts). Grouped by the rule each phrase enforces from
// the Phase 5.4 system-prompt contract: never diagnose, never compare this
// learner to others, never predict outcomes, never rank.

export const DIAGNOSTIC_LANGUAGE: readonly string[] = [
  "diagnos",
  "disorder",
  "adhd",
  "autis",
  "dyslexi",
  "dyscalculi",
  "learning difficulty",
  "learning difficulties",
  "learning disability",
  "special needs",
  "special educational needs",
];

export const COMPARATIVE_LANGUAGE: readonly string[] = [
  "compared to other",
  "compared with other",
  "better than other",
  "worse than other",
  "smarter than",
  "other children",
  "other learners",
  "other students",
  "average child",
  "behind other",
  "ahead of other",
];

export const PREDICTIVE_LANGUAGE: readonly string[] = [
  "will pass",
  "will fail",
  "guaranteed",
  "destined to",
  "will definitely",
  "will score",
  "predicted grade",
  "predicted score",
  "is going to fail",
  "is going to pass",
];

/** Ranking/labelling language — this app never ranks a learner against anyone else. */
export const RANKING_LANGUAGE: readonly string[] = [
  "behind",
  "below average",
  "top student",
  "top 10%",
  "top of the class",
  "gifted",
  "poor learner",
  "weak child",
];

export const BANNED_PHRASES: readonly string[] = [
  ...DIAGNOSTIC_LANGUAGE,
  ...COMPARATIVE_LANGUAGE,
  ...PREDICTIVE_LANGUAGE,
  ...RANKING_LANGUAGE,
];

import type { AdaptiveMissionConfig } from "./adaptive.types";

// All of Phase 5.2's tunable numbers in one place, matching the target
// allocations and difficulty bands specified for the adaptive generator.
// See docs/Architecture.md → "Adaptive mission generation" for the write-up.

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveMissionConfig = {
  missionSize: 16,
  categoryTargets: {
    weakSkill: 7,
    reviewDue: 4,
    curriculumCoverage: 3,
    challenge: 2,
  },
  weakMasteryThreshold: 60,
  challengeMinMastery: 70,
  challengeMinDifficulty: 4,
  challengeExcludeBelowMastery: 50,
  subjectSoftCap: 7,
  subjectSoftMinimum: 2,
  cooldownDays: 7,
  newLearnerMaxDifficulty4: 2,
  newLearnerAllowDifficulty5: false,
  untestedSkillDifficulty: [2, 3],
  // Evaluated by highest applicable minMastery <= score. Ranking hints, not
  // hard filters — see adaptive-selector.ts's difficultyMatchScore.
  difficultyBands: [
    { minMastery: 0, preferred: [1, 2], allowed: [1, 2, 3] },
    { minMastery: 40, preferred: [2, 3], allowed: [1, 2, 3, 4] },
    { minMastery: 60, preferred: [3, 4], allowed: [2, 3, 4, 5] },
    { minMastery: 80, preferred: [4, 5], allowed: [3, 4, 5] },
  ],
};

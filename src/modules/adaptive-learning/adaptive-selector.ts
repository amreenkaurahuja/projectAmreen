import {
  buildMissionSeed,
  createSeededRandomFromString,
  hashStringToSeed,
  seededShuffle,
} from "./seeded-random";
import type {
  AdaptiveMissionConfig,
  AdaptiveSelectionInput,
  AdaptiveSelectionResult,
  DifficultyBand,
  QuestionCandidate,
  SelectedQuestion,
  SelectionReason,
} from "./adaptive.types";

// Pure, deterministic, no I/O. Given the same input (candidates, mastery,
// recent attempts, subjects, reference timestamp, config) this always
// produces the same selected question IDs in the same order. See
// docs/Architecture.md → "Adaptive mission generation" for the full
// algorithm write-up (category definitions, fallback order, difficulty
// bands, cooldown).

const EMPTY_CATEGORY_COUNTS: Record<SelectionReason, number> = {
  weak_skill: 0,
  review_due: 0,
  curriculum_coverage: 0,
  challenge: 0,
  fallback: 0,
};

function comparePriority(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function tieBreak(seed: string, questionId: string): number {
  return hashStringToSeed(`${seed}:tiebreak:${questionId}`);
}

function isOnCooldown(
  questionId: string,
  recentAttemptsByQuestion: Map<string, string>,
  referenceTimestamp: Date,
  cooldownDays: number,
): boolean {
  const answeredAt = recentAttemptsByQuestion.get(questionId);
  if (!answeredAt) return false;
  const cutoffMs =
    referenceTimestamp.getTime() - cooldownDays * 24 * 60 * 60 * 1000;
  return new Date(answeredAt).getTime() >= cutoffMs;
}

function resolveDifficultyBand(
  masteryScore: number,
  bands: readonly DifficultyBand[],
): DifficultyBand {
  let applicable = bands[0]!;
  for (const band of bands) {
    if (masteryScore >= band.minMastery) applicable = band;
  }
  return applicable;
}

/** Untested skills (no mastery row) are scored as if mastery were 50 — lands in the 40-59 band, whose preferred range [2,3] matches the untested-skill spec directly. */
function difficultyMatchScore(
  difficulty: number,
  masteryScore: number | undefined,
  config: AdaptiveMissionConfig,
): number {
  const band = resolveDifficultyBand(
    masteryScore ?? 50,
    config.difficultyBands,
  );
  if (band.preferred.includes(difficulty)) return 2;
  if (band.allowed.includes(difficulty)) return 1;
  return 0;
}

function toSelected(
  candidate: QuestionCandidate,
  reason: SelectionReason,
): SelectedQuestion {
  return {
    questionId: candidate.questionId,
    subjectId: candidate.subjectId,
    subjectSlug: candidate.subjectSlug,
    skillId: candidate.skillId,
    difficulty: candidate.difficulty,
    reason,
  };
}

function dedupeCandidates(
  candidates: QuestionCandidate[],
): QuestionCandidate[] {
  const seen = new Set<string>();
  const unique: QuestionCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.questionId)) continue;
    seen.add(candidate.questionId);
    unique.push(candidate);
  }
  return unique;
}

function countByReason(
  items: readonly SelectedQuestion[],
): Record<SelectionReason, number> {
  const counts = { ...EMPTY_CATEGORY_COUNTS };
  for (const item of items) {
    counts[item.reason] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Category 1: review due — oldest overdue first, then lowest mastery.
// Cooldown does NOT apply here: a due review is exactly the case the spec
// says should override the recent-question cooldown.
// ---------------------------------------------------------------------------
function pickReviewDue(
  input: AdaptiveSelectionInput,
  selectedIds: ReadonlySet<string>,
  seed: string,
): SelectedQuestion[] {
  const dueSkills = [...input.masteryBySkill.values()].filter(
    (m) =>
      m.nextReviewAt !== null &&
      new Date(m.nextReviewAt) <= input.referenceTimestamp,
  );
  if (dueSkills.length === 0) return [];

  const dueBySkill = new Map(dueSkills.map((m) => [m.skillId, m]));
  const scored = input.candidates
    .filter((c) => dueBySkill.has(c.skillId) && !selectedIds.has(c.questionId))
    .map((c) => {
      const mastery = dueBySkill.get(c.skillId)!;
      return {
        candidate: c,
        priority: [
          new Date(mastery.nextReviewAt!).getTime(),
          mastery.masteryScore,
          -difficultyMatchScore(
            c.difficulty,
            mastery.masteryScore,
            input.config,
          ),
          tieBreak(seed, c.questionId),
        ],
      };
    })
    .sort((a, b) => comparePriority(a.priority, b.priority));

  return scored
    .slice(0, input.config.categoryTargets.reviewDue)
    .map((entry) => toSelected(entry.candidate, "review_due"));
}

// ---------------------------------------------------------------------------
// Category 2: weak skills — lowest mastery first, tie-broken by more
// attempts. Skills already used by review_due and cooldown-affected
// questions are deprioritised (tiered), not excluded — both are pulled back
// in automatically if needed to reach the target.
// ---------------------------------------------------------------------------
function pickWeakSkill(
  input: AdaptiveSelectionInput,
  selectedIds: ReadonlySet<string>,
  usedSkillIds: ReadonlySet<string>,
  seed: string,
): SelectedQuestion[] {
  const weakSkills = [...input.masteryBySkill.values()].filter(
    (m) => m.masteryScore < input.config.weakMasteryThreshold,
  );
  if (weakSkills.length === 0) return [];

  const weakBySkill = new Map(weakSkills.map((m) => [m.skillId, m]));
  const scored = input.candidates
    .filter((c) => weakBySkill.has(c.skillId) && !selectedIds.has(c.questionId))
    .map((c) => {
      const mastery = weakBySkill.get(c.skillId)!;
      const cooldown = isOnCooldown(
        c.questionId,
        input.recentAttemptsByQuestion,
        input.referenceTimestamp,
        input.config.cooldownDays,
      );
      return {
        candidate: c,
        priority: [
          usedSkillIds.has(c.skillId) ? 1 : 0,
          cooldown ? 1 : 0,
          mastery.masteryScore,
          -mastery.totalAttempts,
          -difficultyMatchScore(
            c.difficulty,
            mastery.masteryScore,
            input.config,
          ),
          tieBreak(seed, c.questionId),
        ],
      };
    })
    .sort((a, b) => comparePriority(a.priority, b.priority));

  return scored
    .slice(0, input.config.categoryTargets.weakSkill)
    .map((entry) => toSelected(entry.candidate, "weak_skill"));
}

// ---------------------------------------------------------------------------
// Category 3: curriculum coverage — round-robin across active subjects so
// no single subject dominates this category; within a subject, untested/
// low-attempt skills come first.
// ---------------------------------------------------------------------------
function pickCurriculumCoverage(
  input: AdaptiveSelectionInput,
  selectedIds: ReadonlySet<string>,
  seed: string,
): SelectedQuestion[] {
  const target = input.config.categoryTargets.curriculumCoverage;
  const bySubject = new Map<string, QuestionCandidate[]>();

  for (const candidate of input.candidates) {
    if (selectedIds.has(candidate.questionId)) continue;
    const list = bySubject.get(candidate.subjectSlug) ?? [];
    list.push(candidate);
    bySubject.set(candidate.subjectSlug, list);
  }

  for (const list of bySubject.values()) {
    list.sort((a, b) => {
      const am = input.masteryBySkill.get(a.skillId);
      const bm = input.masteryBySkill.get(b.skillId);
      const aPriority = [
        isOnCooldown(
          a.questionId,
          input.recentAttemptsByQuestion,
          input.referenceTimestamp,
          input.config.cooldownDays,
        )
          ? 1
          : 0,
        am ? 1 : 0,
        am?.totalAttempts ?? 0,
        -difficultyMatchScore(a.difficulty, am?.masteryScore, input.config),
        tieBreak(seed, a.questionId),
      ];
      const bPriority = [
        isOnCooldown(
          b.questionId,
          input.recentAttemptsByQuestion,
          input.referenceTimestamp,
          input.config.cooldownDays,
        )
          ? 1
          : 0,
        bm ? 1 : 0,
        bm?.totalAttempts ?? 0,
        -difficultyMatchScore(b.difficulty, bm?.masteryScore, input.config),
        tieBreak(seed, b.questionId),
      ];
      return comparePriority(aPriority, bPriority);
    });
  }

  const subjectOrder = seededShuffle(
    input.activeSubjectSlugs,
    createSeededRandomFromString(`${seed}:coverage-subjects`),
  );

  const picked: SelectedQuestion[] = [];
  let progressed = true;
  while (picked.length < target && progressed) {
    progressed = false;
    for (const subject of subjectOrder) {
      if (picked.length >= target) break;
      const next = bySubject.get(subject)?.shift();
      if (!next) continue;
      picked.push(toSelected(next, "curriculum_coverage"));
      progressed = true;
    }
  }

  return picked;
}

// ---------------------------------------------------------------------------
// Category 4: challenge — difficulty 4-5 only (hard filter). Skills below
// the exclude threshold are only used if nothing else is available; skills
// between the exclude and preferred thresholds are a middle tier.
// ---------------------------------------------------------------------------
function pickChallenge(
  input: AdaptiveSelectionInput,
  selectedIds: ReadonlySet<string>,
  seed: string,
): SelectedQuestion[] {
  const scored = input.candidates
    .filter(
      (c) =>
        c.difficulty >= input.config.challengeMinDifficulty &&
        !selectedIds.has(c.questionId),
    )
    .map((c) => {
      const mastery = input.masteryBySkill.get(c.skillId);
      const masteryScore = mastery?.masteryScore ?? 50;
      return {
        candidate: c,
        priority: [
          masteryScore < input.config.challengeExcludeBelowMastery ? 1 : 0,
          masteryScore < input.config.challengeMinMastery ? 1 : 0,
          -masteryScore,
          tieBreak(seed, c.questionId),
        ],
      };
    })
    .sort((a, b) => comparePriority(a.priority, b.priority));

  return scored
    .slice(0, input.config.categoryTargets.challenge)
    .map((entry) => toSelected(entry.candidate, "challenge"));
}

// ---------------------------------------------------------------------------
// Fallback — fills any remaining slots. The spec's 5-step recommended order
// collapses in practice to "any remaining active candidate, preferring ones
// off cooldown and subjects not yet at their soft minimum": curriculum
// coverage has no exclusive eligibility criterion of its own (any active
// question qualifies), so steps 1-3 of that order are indistinguishable by
// this point — everything left in the pool already "matches curriculum
// coverage." Recomputed incrementally (not a single static sort) so the
// subject-minimum preference reacts to what's already been picked in this
// same pass, not just before it started.
// ---------------------------------------------------------------------------
function pickFallback(
  input: AdaptiveSelectionInput,
  selectedIds: ReadonlySet<string>,
  subjectCounts: ReadonlyMap<string, number>,
  remainingSlots: number,
  seed: string,
): SelectedQuestion[] {
  if (remainingSlots <= 0) return [];

  const picked: SelectedQuestion[] = [];
  const pickedIds = new Set<string>();
  const localSubjectCounts = new Map(subjectCounts);

  while (picked.length < remainingSlots) {
    const eligible = input.candidates.filter(
      (c) => !selectedIds.has(c.questionId) && !pickedIds.has(c.questionId),
    );
    if (eligible.length === 0) break;

    let best = eligible[0]!;
    let bestPriority = fallbackPriority(best, input, localSubjectCounts, seed);

    for (const candidate of eligible.slice(1)) {
      const priority = fallbackPriority(
        candidate,
        input,
        localSubjectCounts,
        seed,
      );
      if (comparePriority(priority, bestPriority) < 0) {
        best = candidate;
        bestPriority = priority;
      }
    }

    picked.push(toSelected(best, "fallback"));
    pickedIds.add(best.questionId);
    localSubjectCounts.set(
      best.subjectSlug,
      (localSubjectCounts.get(best.subjectSlug) ?? 0) + 1,
    );
  }

  return picked;
}

function fallbackPriority(
  candidate: QuestionCandidate,
  input: AdaptiveSelectionInput,
  subjectCounts: ReadonlyMap<string, number>,
  seed: string,
): number[] {
  const count = subjectCounts.get(candidate.subjectSlug) ?? 0;
  return [
    count < input.config.subjectSoftMinimum ? 0 : 1,
    isOnCooldown(
      candidate.questionId,
      input.recentAttemptsByQuestion,
      input.referenceTimestamp,
      input.config.cooldownDays,
    )
      ? 1
      : 0,
    count >= input.config.subjectSoftCap ? 1 : 0,
    tieBreak(seed, candidate.questionId),
  ];
}

// ---------------------------------------------------------------------------
// New-learner baseline (section 3): no mastery data at all. Balanced,
// low-difficulty, round-robin across subjects.
// ---------------------------------------------------------------------------
function baselineDifficultyTier(
  difficulty: number,
  config: AdaptiveMissionConfig,
): number {
  if (difficulty <= 3) return 0;
  if (difficulty === 4) return 1;
  return config.newLearnerAllowDifficulty5 ? 2 : 3;
}

function selectBaselineMission(
  input: AdaptiveSelectionInput,
  candidates: QuestionCandidate[],
): AdaptiveSelectionResult {
  const seed = buildMissionSeed(input.learnerId, input.missionDate);
  const config = input.config;

  const bySubject = new Map<string, QuestionCandidate[]>();
  for (const candidate of candidates) {
    const list = bySubject.get(candidate.subjectSlug) ?? [];
    list.push(candidate);
    bySubject.set(candidate.subjectSlug, list);
  }

  for (const list of bySubject.values()) {
    list.sort((a, b) =>
      comparePriority(
        [
          baselineDifficultyTier(a.difficulty, config),
          tieBreak(seed, a.questionId),
        ],
        [
          baselineDifficultyTier(b.difficulty, config),
          tieBreak(seed, b.questionId),
        ],
      ),
    );
  }

  const subjectOrder = seededShuffle(
    input.activeSubjectSlugs,
    createSeededRandomFromString(`${seed}:baseline-subjects`),
  );

  const picked: SelectedQuestion[] = [];
  let difficulty4Count = 0;
  let progressed = true;

  while (picked.length < config.missionSize && progressed) {
    progressed = false;
    for (const subject of subjectOrder) {
      if (picked.length >= config.missionSize) break;
      const queue = bySubject.get(subject);
      if (!queue || queue.length === 0) continue;

      let index = 0;
      while (index < queue.length) {
        const candidate = queue[index]!;
        if (candidate.difficulty === 5 && !config.newLearnerAllowDifficulty5) {
          index += 1;
          continue;
        }
        if (
          candidate.difficulty === 4 &&
          difficulty4Count >= config.newLearnerMaxDifficulty4
        ) {
          index += 1;
          continue;
        }
        break;
      }
      if (index >= queue.length) continue;

      const [chosen] = queue.splice(index, 1);
      if (!chosen) continue;
      if (chosen.difficulty === 4) difficulty4Count += 1;
      picked.push(toSelected(chosen, "curriculum_coverage"));
      progressed = true;
    }
  }

  // The pool was insufficient even after relaxing nothing further within
  // the loop above (every remaining candidate was blocked by the d4 cap or
  // the d5 exclusion). Only now do we relax those constraints, using
  // whatever remains, so the mission still gets as close to 16 as possible.
  if (picked.length < config.missionSize) {
    const pickedIds = new Set(picked.map((p) => p.questionId));
    const leftover = candidates
      .filter((c) => !pickedIds.has(c.questionId))
      .sort(
        (a, b) => tieBreak(seed, a.questionId) - tieBreak(seed, b.questionId),
      );
    for (const candidate of leftover) {
      if (picked.length >= config.missionSize) break;
      picked.push(toSelected(candidate, "fallback"));
    }
  }

  const rng = createSeededRandomFromString(seed);
  const ordered = seededShuffle(picked, rng);

  return {
    items: ordered,
    categoryCounts: countByReason(ordered),
    fallbackCount: countByReason(ordered).fallback,
    candidateCount: candidates.length,
    capacityWarning: ordered.length < config.missionSize,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export function selectAdaptiveMission(
  input: AdaptiveSelectionInput,
): AdaptiveSelectionResult {
  const candidates = dedupeCandidates(input.candidates);
  const workingInput: AdaptiveSelectionInput = { ...input, candidates };

  if (candidates.length === 0) {
    return {
      items: [],
      categoryCounts: { ...EMPTY_CATEGORY_COUNTS },
      fallbackCount: 0,
      candidateCount: 0,
      capacityWarning: true,
    };
  }

  if (workingInput.masteryBySkill.size === 0) {
    return selectBaselineMission(workingInput, candidates);
  }

  const seed = buildMissionSeed(
    workingInput.learnerId,
    workingInput.missionDate,
  );
  const selectedIds = new Set<string>();
  const selected: SelectedQuestion[] = [];
  const subjectCounts = new Map<string, number>();

  function commit(items: SelectedQuestion[]) {
    for (const item of items) {
      selected.push(item);
      selectedIds.add(item.questionId);
      subjectCounts.set(
        item.subjectSlug,
        (subjectCounts.get(item.subjectSlug) ?? 0) + 1,
      );
    }
  }

  const reviewDuePicked = pickReviewDue(workingInput, selectedIds, seed);
  commit(reviewDuePicked);
  const usedSkillIds = new Set(reviewDuePicked.map((item) => item.skillId));

  commit(pickWeakSkill(workingInput, selectedIds, usedSkillIds, seed));
  commit(pickCurriculumCoverage(workingInput, selectedIds, seed));
  commit(pickChallenge(workingInput, selectedIds, seed));

  const remainingSlots = workingInput.config.missionSize - selected.length;
  commit(
    pickFallback(
      workingInput,
      selectedIds,
      subjectCounts,
      remainingSlots,
      seed,
    ),
  );

  const rng = createSeededRandomFromString(seed);
  const ordered = seededShuffle(selected, rng);

  return {
    items: ordered,
    categoryCounts: countByReason(ordered),
    fallbackCount: countByReason(ordered).fallback,
    candidateCount: candidates.length,
    capacityWarning: ordered.length < workingInput.config.missionSize,
  };
}

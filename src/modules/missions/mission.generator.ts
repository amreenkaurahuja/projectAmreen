import type { MissionItem } from "./mission.types";

export type SubjectSlug =
  "mathematics" | "english" | "verbal-reasoning" | "non-verbal-reasoning";

export interface DatabaseQuestionRecord {
  id: string;
  subjectSlug: SubjectSlug;
}

export class MissionGenerationError extends Error {}

const SUBJECT_ORDER: SubjectSlug[] = [
  "mathematics",
  "english",
  "verbal-reasoning",
  "non-verbal-reasoning",
];

const SUBJECT_TARGETS: Record<SubjectSlug, number> = {
  mathematics: 8,
  english: 4,
  "verbal-reasoning": 2,
  "non-verbal-reasoning": 2,
};

export function generateMissionItems(
  selections: Partial<Record<SubjectSlug, DatabaseQuestionRecord[]>>,
): MissionItem[] {
  const queues = SUBJECT_ORDER.map((subjectSlug) => {
    const requestedCount = SUBJECT_TARGETS[subjectSlug];
    const uniqueQuestions: DatabaseQuestionRecord[] = [];
    const seenIds = new Set<string>();

    for (const candidate of shuffle(selections[subjectSlug] ?? [])) {
      if (seenIds.has(candidate.id)) continue;
      seenIds.add(candidate.id);
      uniqueQuestions.push(candidate);
      if (uniqueQuestions.length === requestedCount) break;
    }

    if (uniqueQuestions.length < requestedCount) {
      throw new MissionGenerationError(
        `Insufficient active questions for ${subjectSlug}: need ${requestedCount}, found ${uniqueQuestions.length}`,
      );
    }

    return uniqueQuestions.map((question) => ({
      id: `${subjectSlug}-${question.id}`,
      questionId: question.id,
      position: 0,
      subjectSlug,
    }));
  });

  const interleaved: MissionItem[] = [];
  while (interleaved.length < 16) {
    let emitted = false;

    for (const queue of queues) {
      if (queue.length === 0) continue;
      const next = queue.shift();
      if (!next) continue;
      interleaved.push({ ...next, position: interleaved.length + 1 });
      emitted = true;
    }

    if (!emitted) break;
  }

  if (interleaved.length !== 16) {
    throw new MissionGenerationError(
      "Mission generation failed to produce 16 questions",
    );
  }

  return interleaved;
}

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

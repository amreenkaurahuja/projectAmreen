import {
  MissionDuplicateError,
  MissionQuestionBankError,
  type MissionRepository,
} from "./mission.repository";
import {
  MissionGenerationError,
  generateMissionItems,
} from "./mission.generator";
import type { MissionSummary } from "./mission.types";

export class MissionService {
  constructor(private readonly repository: MissionRepository) {}

  async getOrCreateTodaysMission(learnerId: string): Promise<MissionSummary> {
    await this.repository.getAuthenticatedUserId();
    await this.repository.ensureLearnerOwned(learnerId);

    const existing = await this.repository.findTodaysMission(learnerId);
    if (existing) {
      return existing;
    }

    try {
      const selections = await Promise.all([
        this.repository.getActiveQuestionsBySubject("mathematics", 8),
        this.repository.getActiveQuestionsBySubject("english", 4),
        this.repository.getActiveQuestionsBySubject("verbal-reasoning", 2),
        this.repository.getActiveQuestionsBySubject("non-verbal-reasoning", 2),
      ]);

      const items = generateMissionItems({
        mathematics: selections[0],
        english: selections[1],
        "verbal-reasoning": selections[2],
        "non-verbal-reasoning": selections[3],
      });

      return await this.repository.createMission(
        learnerId,
        todayUtc(),
        20,
        items,
      );
    } catch (error) {
      if (isMissionDuplicateError(error)) {
        const competing = await this.repository.findTodaysMission(learnerId);
        if (competing) {
          return competing;
        }
      }

      if (error instanceof MissionGenerationError) {
        throw new MissionQuestionBankError(error.message);
      }

      throw error;
    }
  }
}

function isMissionDuplicateError(error: unknown): boolean {
  if (error instanceof MissionDuplicateError) return true;
  if (error instanceof Error) {
    return (
      error.name === "MissionDuplicateError" ||
      /already exists|duplicate/i.test(error.message)
    );
  }
  return false;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

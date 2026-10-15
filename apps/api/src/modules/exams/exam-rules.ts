import type { ExamPhase } from '@exam/shared';
import { deriveSeed, mulberry32, seededShuffle } from '../../common/random';

/** Phase is derived from the stored status and the DB clock, so no cron flips states. */
export function examPhase(
  exam: { status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; startAt: Date; endAt: Date },
  now: Date,
): ExamPhase {
  if (exam.status === 'DRAFT') return 'DRAFT';
  if (exam.status === 'ARCHIVED') return 'ARCHIVED';
  if (now < exam.startAt) return 'SCHEDULED';
  if (now < exam.endAt) return 'OPEN';
  return 'CLOSED';
}

/** An attempt never outlives the exam window (Moodle-style). */
export function computeDeadline(startedAt: Date, durationSeconds: number, examEndAt: Date): Date {
  const byDuration = new Date(startedAt.getTime() + durationSeconds * 1000);
  return byDuration < examEndAt ? byDuration : examEndAt;
}

export function resultsReleased(resultsReleaseAt: Date | null, now: Date): boolean {
  return resultsReleaseAt !== null && now >= resultsReleaseAt;
}

export interface PickInput {
  seed: number;
  shuffleQuestions: boolean;
  /** Frozen fixed questions in teacher-defined order. */
  fixed: string[];
  /** Random-draw sections in order; pools were made disjoint (and exclude fixed) at publish. */
  sections: { pickCount: number; pool: string[] }[];
}

/** Deterministically chooses the question versions of an attempt from its seed. */
export function pickQuestionVersions(input: PickInput): string[] {
  const rand = mulberry32(input.seed);
  const chosen: string[] = [...input.fixed];
  const taken = new Set(chosen);
  for (const section of input.sections) {
    const candidates = [...section.pool].sort().filter((id) => !taken.has(id));
    if (candidates.length < section.pickCount) {
      throw new Error('Question pool smaller than pick count');
    }
    for (const id of seededShuffle(candidates, rand).slice(0, section.pickCount)) {
      chosen.push(id);
      taken.add(id);
    }
  }
  return input.shuffleQuestions ? seededShuffle(chosen, rand) : chosen;
}

/** Option display order for one question of an attempt (true/false keeps its natural order). */
export function optionOrder(
  seed: number,
  questionVersionId: string,
  optionIdsInOrder: string[],
  shuffle: boolean,
): string[] {
  if (!shuffle) return optionIdsInOrder;
  return seededShuffle(optionIdsInOrder, mulberry32(deriveSeed(seed, questionVersionId)));
}

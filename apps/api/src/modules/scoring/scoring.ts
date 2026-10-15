import type { QuestionOutcome, ResultBreakdownItem } from '@exam/shared';

/**
 * Pure scoring engine — no I/O, fully unit tested.
 * Grading is by option id, never by display position, so shuffling cannot affect scores.
 */
export interface ScorableQuestion {
  position: number;
  questionVersionId: string;
  type: 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE';
  marks: number;
  negativeMarks: number;
  correctOptionIds: string[];
  /** All option ids of the version; selections outside this set are ignored. */
  optionIds: string[];
}

export interface ScoringPolicy {
  /** MULTIPLE only: award marks * max(0, (rightPicked - wrongPicked) / totalRight). */
  partialCredit: boolean;
  /** Clamp the total at zero when negative marking would push it below. */
  clampTotalAtZero: boolean;
}

export interface ScoreSummary {
  score: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  breakdown: ResultBreakdownItem[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function scoreQuestion(
  q: ScorableQuestion,
  selected: readonly string[] | undefined,
  policy: ScoringPolicy,
): { outcome: QuestionOutcome; awarded: number } {
  const valid = new Set(q.optionIds);
  const picked = new Set((selected ?? []).filter((id) => valid.has(id)));
  if (picked.size === 0) return { outcome: 'BLANK', awarded: 0 };

  const correct = new Set(q.correctOptionIds);
  const exact = picked.size === correct.size && [...picked].every((id) => correct.has(id));
  if (exact) return { outcome: 'CORRECT', awarded: round2(q.marks) };

  if (q.type === 'MULTIPLE' && policy.partialCredit && correct.size > 0) {
    let right = 0;
    let wrong = 0;
    for (const id of picked) {
      if (correct.has(id)) right++;
      else wrong++;
    }
    const fraction = Math.max(0, (right - wrong) / correct.size);
    if (fraction > 0) return { outcome: 'PARTIAL', awarded: round2(q.marks * fraction) };
  }
  const penalty = Math.abs(q.negativeMarks);
  return { outcome: 'WRONG', awarded: penalty === 0 ? 0 : -round2(penalty) };
}

export function scoreAttempt(
  questions: readonly ScorableQuestion[],
  answers: ReadonlyMap<string, readonly string[]>,
  policy: ScoringPolicy,
): ScoreSummary {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  const breakdown: ResultBreakdownItem[] = [];

  for (const q of [...questions].sort((a, b) => a.position - b.position)) {
    const { outcome, awarded } = scoreQuestion(q, answers.get(q.questionVersionId), policy);
    score += awarded;
    maxScore += q.marks;
    if (outcome === 'CORRECT') correctCount++;
    else if (outcome === 'BLANK') blankCount++;
    else wrongCount++;
    breakdown.push({
      position: q.position,
      questionVersionId: q.questionVersionId,
      outcome,
      awarded,
      marks: round2(q.marks),
    });
  }

  if (policy.clampTotalAtZero) score = Math.max(0, score);
  return { score: round2(score), maxScore: round2(maxScore), correctCount, wrongCount, blankCount, breakdown };
}

/** Combine several graded attempts into the student's final mark (Moodle "grading method"). */
export function combineAttemptScores(
  method: 'HIGHEST' | 'LAST' | 'FIRST' | 'AVERAGE',
  attempts: readonly { attemptNo: number; score: number }[],
): number | null {
  if (attempts.length === 0) return null;
  const ordered = [...attempts].sort((a, b) => a.attemptNo - b.attemptNo);
  switch (method) {
    case 'HIGHEST':
      return Math.max(...ordered.map((a) => a.score));
    case 'FIRST':
      return ordered[0].score;
    case 'LAST':
      return ordered[ordered.length - 1].score;
    case 'AVERAGE':
      return round2(ordered.reduce((s, a) => s + a.score, 0) / ordered.length);
  }
}

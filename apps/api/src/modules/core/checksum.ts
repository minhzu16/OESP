import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface AnswerForHash {
  questionVersionId: string;
  selectedOptionIds: readonly string[];
}

/** Canonical hash of a student's answers (order-independent). */
export function answersHash(answers: readonly AnswerForHash[]): string {
  const canonical = answers
    .map((a) => [a.questionVersionId, [...a.selectedOptionIds].sort()] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * HMAC over the fields that define a result. Anyone editing `results` directly in the DB
 * without the server secret produces a checksum mismatch detected by the verifier job.
 */
export function resultChecksum(
  secret: string,
  attemptId: string,
  score: number,
  maxScore: number,
  answersDigest: string,
): string {
  return createHmac('sha256', secret)
    .update(`${attemptId}|${score.toFixed(2)}|${maxScore.toFixed(2)}|${answersDigest}`)
    .digest('hex');
}

export function checksumMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(actual, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

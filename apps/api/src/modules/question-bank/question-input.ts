import { createHash } from 'node:crypto';
import type { QuestionInput, QuestionType } from '@exam/shared';

export const QUESTION_TYPES: QuestionType[] = ['SINGLE', 'MULTIPLE', 'TRUE_FALSE'];
export const MAX_OPTIONS = 10;

/** Business validation shared by the CRUD endpoints and every import format. Returns error messages. */
export function validateQuestionInput(q: QuestionInput): string[] {
  const errors: string[] = [];
  if (!QUESTION_TYPES.includes(q.type)) errors.push(`type must be one of ${QUESTION_TYPES.join(', ')}`);
  if (!q.content || !q.content.trim()) errors.push('content is required');
  if (q.content && q.content.length > 10_000) errors.push('content is too long');
  if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) {
    errors.push('difficulty must be an integer 1..5');
  }
  if (!(q.marks > 0) || q.marks > 1000) errors.push('marks must be > 0 and <= 1000');
  if (!(q.negativeMarks >= 0) || q.negativeMarks > q.marks) errors.push('negativeMarks must be 0..marks');
  if (!Array.isArray(q.options)) {
    errors.push('options are required');
    return errors;
  }
  const opts = q.options;
  if (opts.some((o) => !o.content || !o.content.trim())) errors.push('option content cannot be empty');
  const normalised = opts.map((o) => normaliseText(o.content ?? ''));
  if (new Set(normalised).size !== normalised.length) errors.push('options must be distinct');
  const correct = opts.filter((o) => o.isCorrect).length;
  if (q.type === 'TRUE_FALSE') {
    if (opts.length !== 2) errors.push('TRUE_FALSE questions need exactly 2 options');
    if (correct !== 1) errors.push('TRUE_FALSE questions need exactly 1 correct option');
  } else {
    if (opts.length < 2 || opts.length > MAX_OPTIONS) errors.push(`questions need 2..${MAX_OPTIONS} options`);
    if (q.type === 'SINGLE' && correct !== 1) errors.push('SINGLE questions need exactly 1 correct option');
    if (q.type === 'MULTIPLE' && correct < 1) errors.push('MULTIPLE questions need at least 1 correct option');
  }
  return errors;
}

export function normaliseTags(tags: readonly string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

/** Lowercase, strip accents/punctuation, collapse whitespace — for duplicate detection only. */
export function normaliseText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // strip combining accents
    .toLowerCase()
    .replace(/đ/g, 'd') // Vietnamese đ has no canonical decomposition
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Two questions are duplicates when content and the option set match after normalisation. */
export function contentHash(q: Pick<QuestionInput, 'content' | 'options'>): string {
  const options = q.options.map((o) => normaliseText(o.content)).sort();
  return createHash('sha256')
    .update(normaliseText(q.content) + '\u0000' + options.join('\u0001'))
    .digest('hex');
}

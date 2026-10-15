import type { QuestionInput, QuestionType } from '@exam/shared';
import { parseCsv } from '../../common/csv';
import { normaliseTags, QUESTION_TYPES, validateQuestionInput } from './question-input';

export type ImportFormat = 'json' | 'csv' | 'text';

export interface ImportError {
  item: number;
  message: string;
}

export interface ParseResult {
  questions: { item: number; input: QuestionInput }[];
  errors: ImportError[];
}

export const MAX_IMPORT_ITEMS = 2000;

export function parseImport(format: ImportFormat, content: string): ParseResult {
  switch (format) {
    case 'json':
      return parseJson(content);
    case 'csv':
      return parseCsvQuestions(content);
    case 'text':
      return parseText(content);
  }
}

function finalise(raw: Partial<QuestionInput> & { options: QuestionInput['options'] }): QuestionInput {
  const correct = raw.options.filter((o) => o.isCorrect).length;
  const looksTrueFalse =
    raw.options.length === 2 &&
    raw.options.every((o) => /^(true|false|đúng|sai)$/i.test(o.content.trim()));
  const type: QuestionType = raw.type ?? (correct > 1 ? 'MULTIPLE' : looksTrueFalse ? 'TRUE_FALSE' : 'SINGLE');
  return {
    type,
    content: (raw.content ?? '').trim(),
    explanation: raw.explanation?.trim() || null,
    difficulty: raw.difficulty ?? 1,
    tags: normaliseTags(raw.tags),
    marks: raw.marks ?? 1,
    negativeMarks: raw.negativeMarks ?? 0,
    options: raw.options.map((o) => ({ content: o.content.trim(), isCorrect: !!o.isCorrect })),
  };
}

function collect(items: { item: number; raw: Parameters<typeof finalise>[0] }[], errors: ImportError[]) {
  const questions: ParseResult['questions'] = [];
  for (const { item, raw } of items.slice(0, MAX_IMPORT_ITEMS)) {
    const input = finalise(raw);
    const problems = validateQuestionInput(input);
    if (problems.length) errors.push({ item, message: problems.join('; ') });
    else questions.push({ item, input });
  }
  if (items.length > MAX_IMPORT_ITEMS) {
    errors.push({ item: MAX_IMPORT_ITEMS + 1, message: `Only the first ${MAX_IMPORT_ITEMS} items were processed` });
  }
  return { questions, errors };
}

/** JSON: `[{ content, type?, difficulty?, tags?, marks?, negativeMarks?, explanation?, options: [{content, isCorrect}] }]` */
export function parseJson(content: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (e) {
    return { questions: [], errors: [{ item: 0, message: `Invalid JSON: ${(e as Error).message}` }] };
  }
  const list = Array.isArray(data) ? data : (data as { questions?: unknown })?.questions;
  if (!Array.isArray(list)) {
    return { questions: [], errors: [{ item: 0, message: 'Expected an array of questions' }] };
  }
  const errors: ImportError[] = [];
  const items: { item: number; raw: Parameters<typeof finalise>[0] }[] = [];
  list.forEach((q: any, i: number) => {
    if (!q || typeof q !== 'object' || !Array.isArray(q.options)) {
      errors.push({ item: i + 1, message: 'Each question needs content and an options array' });
      return;
    }
    const type = typeof q.type === 'string' ? q.type.toUpperCase() : undefined;
    items.push({
      item: i + 1,
      raw: {
        type: QUESTION_TYPES.includes(type) ? type : undefined,
        content: String(q.content ?? ''),
        explanation: q.explanation ? String(q.explanation) : null,
        difficulty: q.difficulty === undefined ? undefined : Number(q.difficulty),
        tags: Array.isArray(q.tags) ? q.tags.map(String) : undefined,
        marks: q.marks === undefined ? undefined : Number(q.marks),
        negativeMarks: q.negativeMarks === undefined ? undefined : Number(q.negativeMarks),
        options: q.options.map((o: any) => ({
          content: String(o?.content ?? ''),
          isCorrect: o?.isCorrect === true,
        })),
      },
    });
  });
  return collect(items, errors);
}

/**
 * CSV with a header row:
 * `content,type,difficulty,tags,marks,negative_marks,explanation,A,B,C,D,...,correct`
 * Option columns are single letters; `correct` lists letters, e.g. `B` or `A;C`. Tags use `;`.
 */
export function parseCsvQuestions(content: string): ParseResult {
  const rows = parseCsv(content);
  if (rows.length < 2) return { questions: [], errors: [{ item: 0, message: 'CSV needs a header and rows' }] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const optionCols = header
    .map((h, i) => ({ letter: h.toUpperCase(), i }))
    .filter((h) => /^[A-J]$/.test(h.letter));
  if (col('content') < 0 || col('correct') < 0 || optionCols.length < 2) {
    return {
      questions: [],
      errors: [{ item: 0, message: 'CSV header must include content, correct and option columns A, B, ...' }],
    };
  }
  const get = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');
  const num = (v: string) => (v === '' ? undefined : Number(v));
  const items = rows.slice(1).map((r, idx) => {
    const correct = new Set(
      get(r, 'correct')
        .toUpperCase()
        .split(/[;,\s]+/)
        .filter(Boolean),
    );
    const type = get(r, 'type').toUpperCase() as QuestionType;
    return {
      item: idx + 2, // spreadsheet row number
      raw: {
        type: QUESTION_TYPES.includes(type) ? type : undefined,
        content: get(r, 'content'),
        explanation: get(r, 'explanation') || null,
        difficulty: num(get(r, 'difficulty')),
        tags: get(r, 'tags').split(';'),
        marks: num(get(r, 'marks')),
        negativeMarks: num(get(r, 'negative_marks')),
        options: optionCols
          .filter((c) => (r[c.i] ?? '').trim() !== '')
          .map((c) => ({ content: r[c.i], isCorrect: correct.has(c.letter) })),
      },
    };
  });
  return collect(items, []);
}

const OPTION_LINE = /^(\*)?\s*(?:([A-Ja-j])[.)]\s+)?(.+)$/;
const ANSWER_LINE = /^(?:answer|đáp án|dap an)\s*[:：]\s*([A-Ja-j](?:\s*[,;]\s*[A-Ja-j])*)\s*$/i;

/**
 * Plain-text format (Quizlet/Aiken-like): blocks separated by a blank line.
 * First line = question; following lines = options; a leading `*` marks a correct option,
 * or use a final `ANSWER: B` / `ANSWER: A,C` line.
 *
 *   What is 2 + 2?
 *   A. 3
 *   *B. 4
 */
export function parseText(content: string): ParseResult {
  const blocks = content
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length > 0);

  const errors: ImportError[] = [];
  const items = blocks.map((lines, idx) => {
    const [question, ...rest] = lines;
    let answerLetters: Set<string> | null = null;
    const options: QuestionInput['options'] = [];
    for (const line of rest) {
      const ans = ANSWER_LINE.exec(line);
      if (ans) {
        answerLetters = new Set(ans[1].toUpperCase().split(/[\s,;]+/).filter(Boolean));
        continue;
      }
      const m = OPTION_LINE.exec(line);
      if (m) options.push({ content: m[3], isCorrect: !!m[1] });
    }
    if (answerLetters) {
      const letters = answerLetters;
      options.forEach((o, i) => (o.isCorrect = letters.has(String.fromCharCode(65 + i))));
    }
    return { item: idx + 1, raw: { content: question, options } };
  });
  return collect(items, errors);
}

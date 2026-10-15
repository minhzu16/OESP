import { computeDeadline, examPhase, optionOrder, pickQuestionVersions, resultsReleased } from './exam-rules';

const t = (iso: string) => new Date(iso);

describe('examPhase', () => {
  const exam = { status: 'PUBLISHED' as const, startAt: t('2026-10-01T08:00:00Z'), endAt: t('2026-10-01T10:00:00Z') };
  it.each([
    ['2026-10-01T07:59:59Z', 'SCHEDULED'],
    ['2026-10-01T08:00:00Z', 'OPEN'],
    ['2026-10-01T09:59:59Z', 'OPEN'],
    ['2026-10-01T10:00:00Z', 'CLOSED'],
  ])('at %s is %s', (now, phase) => {
    expect(examPhase(exam, t(now))).toBe(phase);
  });
  it('draft and archived ignore the clock', () => {
    expect(examPhase({ ...exam, status: 'DRAFT' }, t('2026-10-01T09:00:00Z'))).toBe('DRAFT');
    expect(examPhase({ ...exam, status: 'ARCHIVED' }, t('2026-10-01T09:00:00Z'))).toBe('ARCHIVED');
  });
});

describe('computeDeadline', () => {
  it('is start + duration when the window allows it', () => {
    expect(computeDeadline(t('2026-10-01T08:00:00Z'), 1800, t('2026-10-01T10:00:00Z'))).toEqual(
      t('2026-10-01T08:30:00Z'),
    );
  });
  it('is capped at the exam end time for late starters', () => {
    expect(computeDeadline(t('2026-10-01T09:50:00Z'), 1800, t('2026-10-01T10:00:00Z'))).toEqual(
      t('2026-10-01T10:00:00Z'),
    );
  });
});

describe('resultsReleased', () => {
  it('requires a release time in the past', () => {
    expect(resultsReleased(null, t('2030-01-01T00:00:00Z'))).toBe(false);
    expect(resultsReleased(t('2026-10-02T00:00:00Z'), t('2026-10-01T00:00:00Z'))).toBe(false);
    expect(resultsReleased(t('2026-10-01T00:00:00Z'), t('2026-10-01T00:00:00Z'))).toBe(true);
  });
});

describe('pickQuestionVersions', () => {
  const input = {
    seed: 42,
    shuffleQuestions: true,
    fixed: ['f1', 'f2'],
    sections: [
      { pickCount: 2, pool: ['a', 'b', 'c', 'd', 'e'] },
      { pickCount: 1, pool: ['x', 'y'] },
    ],
  };

  it('is deterministic for a given seed', () => {
    expect(pickQuestionVersions(input)).toEqual(pickQuestionVersions(input));
  });

  it('includes fixed questions and the requested number per section without duplicates', () => {
    const picked = pickQuestionVersions(input);
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
    expect(picked).toEqual(expect.arrayContaining(['f1', 'f2']));
    expect(picked.filter((id) => ['a', 'b', 'c', 'd', 'e'].includes(id))).toHaveLength(2);
    expect(picked.filter((id) => ['x', 'y'].includes(id))).toHaveLength(1);
  });

  it('keeps teacher order when shuffling is off', () => {
    const picked = pickQuestionVersions({ ...input, shuffleQuestions: false });
    expect(picked.slice(0, 2)).toEqual(['f1', 'f2']);
  });

  it('different seeds give different draws', () => {
    const draws = new Set(
      Array.from({ length: 20 }, (_, seed) => pickQuestionVersions({ ...input, seed }).join(',')),
    );
    expect(draws.size).toBeGreaterThan(1);
  });

  it('fails loudly when a pool is too small', () => {
    expect(() => pickQuestionVersions({ ...input, sections: [{ pickCount: 3, pool: ['a'] }] })).toThrow();
  });
});

describe('optionOrder', () => {
  it('is a stable permutation per (seed, question)', () => {
    const ids = ['o1', 'o2', 'o3', 'o4'];
    const a = optionOrder(7, 'q1', ids, true);
    expect(a).toEqual(optionOrder(7, 'q1', ids, true));
    expect([...a].sort()).toEqual(ids);
    expect(optionOrder(7, 'q1', ids, false)).toEqual(ids);
  });
});

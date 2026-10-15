import { combineAttemptScores, ScorableQuestion, scoreAttempt, scoreQuestion } from './scoring';

const single: ScorableQuestion = {
  position: 0,
  questionVersionId: 'q1',
  type: 'SINGLE',
  marks: 2,
  negativeMarks: 0.5,
  optionIds: ['a', 'b', 'c'],
  correctOptionIds: ['b'],
};

const multiple: ScorableQuestion = {
  position: 1,
  questionVersionId: 'q2',
  type: 'MULTIPLE',
  marks: 3,
  negativeMarks: 0,
  optionIds: ['a', 'b', 'c', 'd'],
  correctOptionIds: ['a', 'c', 'd'],
};

const strict = { partialCredit: false, clampTotalAtZero: true };
const partial = { partialCredit: true, clampTotalAtZero: true };

describe('scoreQuestion', () => {
  it('awards full marks for an exact match', () => {
    expect(scoreQuestion(single, ['b'], strict)).toEqual({ outcome: 'CORRECT', awarded: 2 });
    expect(scoreQuestion(multiple, ['d', 'a', 'c'], strict)).toEqual({ outcome: 'CORRECT', awarded: 3 });
  });

  it('treats empty, missing and foreign option ids as blank', () => {
    expect(scoreQuestion(single, [], strict)).toEqual({ outcome: 'BLANK', awarded: 0 });
    expect(scoreQuestion(single, undefined, strict)).toEqual({ outcome: 'BLANK', awarded: 0 });
    expect(scoreQuestion(single, ['zzz'], strict)).toEqual({ outcome: 'BLANK', awarded: 0 });
  });

  it('applies negative marks to wrong answers', () => {
    expect(scoreQuestion(single, ['a'], strict)).toEqual({ outcome: 'WRONG', awarded: -0.5 });
  });

  it('is all-or-nothing for MULTIPLE without partial credit', () => {
    expect(scoreQuestion(multiple, ['a', 'c'], strict)).toEqual({ outcome: 'WRONG', awarded: 0 });
  });

  it('gives proportional partial credit, penalising wrong picks', () => {
    expect(scoreQuestion(multiple, ['a', 'c'], partial)).toEqual({ outcome: 'PARTIAL', awarded: 2 });
    expect(scoreQuestion(multiple, ['a', 'c', 'b'], partial)).toEqual({ outcome: 'PARTIAL', awarded: 1 });
    expect(scoreQuestion(multiple, ['a', 'b'], partial).outcome).toBe('WRONG');
  });

  it('ignores duplicate ids', () => {
    expect(scoreQuestion(single, ['b', 'b'], strict).outcome).toBe('CORRECT');
  });
});

describe('scoreAttempt', () => {
  it('sums scores, counts outcomes and orders the breakdown by position', () => {
    const r = scoreAttempt(
      [multiple, single],
      new Map([
        ['q1', ['b']],
        ['q2', ['a']],
      ]),
      strict,
    );
    expect(r).toMatchObject({ score: 2, maxScore: 5, correctCount: 1, wrongCount: 1, blankCount: 0 });
    expect(r.breakdown.map((b) => b.position)).toEqual([0, 1]);
  });

  it('clamps negative totals at zero', () => {
    const r = scoreAttempt([single], new Map([['q1', ['a']]]), strict);
    expect(r.score).toBe(0);
    expect(scoreAttempt([single], new Map([['q1', ['a']]]), { ...strict, clampTotalAtZero: false }).score).toBe(-0.5);
  });
});

describe('combineAttemptScores', () => {
  const attempts = [
    { attemptNo: 2, score: 8 },
    { attemptNo: 1, score: 5 },
    { attemptNo: 3, score: 6 },
  ];
  it.each([
    ['HIGHEST', 8],
    ['FIRST', 5],
    ['LAST', 6],
    ['AVERAGE', 6.33],
  ] as const)('%s', (method, expected) => {
    expect(combineAttemptScores(method, attempts)).toBe(expected);
  });
  it('returns null without graded attempts', () => {
    expect(combineAttemptScores('HIGHEST', [])).toBeNull();
  });
});

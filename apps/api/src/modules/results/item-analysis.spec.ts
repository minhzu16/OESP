import { analyseItems, scoreDistribution } from './item-analysis';
import { answersHash, checksumMatches, resultChecksum } from '../core/checksum';
import { toCsv } from '../../common/csv';

describe('analyseItems', () => {
  it('computes difficulty, discrimination and option counts', () => {
    // 4 students; q1 answered correctly only by the two strongest.
    const totals = { s1: 10, s2: 8, s3: 3, s4: 1 };
    const obs = Object.entries(totals).flatMap(([attemptId, totalScore], i) => [
      {
        attemptId,
        totalScore,
        questionVersionId: 'q1',
        outcome: (i < 2 ? 'CORRECT' : 'WRONG') as 'CORRECT' | 'WRONG',
        selectedOptionIds: [i < 2 ? 'right' : 'wrong'],
      },
    ]);
    const [stats] = analyseItems(obs);
    expect(stats).toMatchObject({ responses: 4, correctRate: 0.5, blankRate: 0, discrimination: 1 });
    expect(stats.optionCounts).toEqual({ right: 2, wrong: 2 });
  });

  it('buckets percentages', () => {
    const d = scoreDistribution([0, 9.9, 10, 55, 100]);
    expect(d.map((b) => b.count)).toEqual([2, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe('result checksum', () => {
  it('is order-independent over answers and sensitive to score changes', () => {
    const h1 = answersHash([
      { questionVersionId: 'b', selectedOptionIds: ['2', '1'] },
      { questionVersionId: 'a', selectedOptionIds: [] },
    ]);
    const h2 = answersHash([
      { questionVersionId: 'a', selectedOptionIds: [] },
      { questionVersionId: 'b', selectedOptionIds: ['1', '2'] },
    ]);
    expect(h1).toBe(h2);
    const c = resultChecksum('secret', 'att', 4, 5, h1);
    expect(checksumMatches(c, resultChecksum('secret', 'att', 4, 5, h2))).toBe(true);
    expect(checksumMatches(c, resultChecksum('secret', 'att', 5, 5, h2))).toBe(false);
    expect(checksumMatches(c, resultChecksum('other', 'att', 4, 5, h2))).toBe(false);
  });
});

describe('toCsv', () => {
  it('quotes and neutralises formula injection', () => {
    const csv = toCsv(['a', 'b'], [['=SUM(1)', 'x,"y"']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(`'=SUM(1),"x,""y"""`);
  });
});

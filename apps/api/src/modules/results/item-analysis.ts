import type { QuestionOutcome } from '@exam/shared';

/**
 * Classical test theory item statistics (the online-exam successor of quiz-app's QuizAnalyzer):
 *  - difficulty index p = share of students answering correctly,
 *  - discrimination D = p(top 27%) − p(bottom 27%) by total score,
 *  - option selection distribution (distractor analysis).
 */
export interface ItemObservation {
  attemptId: string;
  totalScore: number;
  questionVersionId: string;
  outcome: QuestionOutcome;
  selectedOptionIds: readonly string[];
}

export interface ItemStats {
  questionVersionId: string;
  responses: number;
  correctRate: number;
  blankRate: number;
  discrimination: number | null;
  optionCounts: Record<string, number>;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function analyseItems(observations: readonly ItemObservation[]): ItemStats[] {
  const totals = new Map<string, number>();
  for (const o of observations) totals.set(o.attemptId, o.totalScore);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const groupSize = Math.floor(ranked.length * 0.27);
  const upper = new Set(ranked.slice(0, groupSize));
  const lower = new Set(ranked.slice(ranked.length - groupSize));

  const byItem = new Map<string, ItemObservation[]>();
  for (const o of observations) {
    const list = byItem.get(o.questionVersionId) ?? [];
    list.push(o);
    byItem.set(o.questionVersionId, list);
  }

  const rate = (list: ItemObservation[]) =>
    list.length === 0 ? 0 : list.filter((o) => o.outcome === 'CORRECT').length / list.length;

  return [...byItem.entries()].map(([questionVersionId, list]) => {
    const optionCounts: Record<string, number> = {};
    for (const o of list) for (const id of o.selectedOptionIds) optionCounts[id] = (optionCounts[id] ?? 0) + 1;
    const up = list.filter((o) => upper.has(o.attemptId));
    const low = list.filter((o) => lower.has(o.attemptId));
    return {
      questionVersionId,
      responses: list.length,
      correctRate: round3(rate(list)),
      blankRate: round3(list.filter((o) => o.outcome === 'BLANK').length / list.length),
      discrimination: groupSize > 0 && up.length > 0 && low.length > 0 ? round3(rate(up) - rate(low)) : null,
      optionCounts,
    };
  });
}

export function scoreDistribution(percentages: readonly number[], buckets = 10): { from: number; to: number; count: number }[] {
  const width = 100 / buckets;
  const out = Array.from({ length: buckets }, (_, i) => ({ from: i * width, to: (i + 1) * width, count: 0 }));
  for (const p of percentages) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor(p / width)));
    out[idx].count++;
  }
  return out;
}

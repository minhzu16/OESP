import type { ResultReviewItem } from '@exam/shared';
import { fmtScore } from '../lib/format';

const OUTCOME: Record<ResultReviewItem['outcome'], [string, string]> = {
  CORRECT: ['green', 'Correct'],
  PARTIAL: ['amber', 'Partial'],
  WRONG: ['red', 'Wrong'],
  BLANK: ['', 'Not answered'],
};

/** Question-by-question review with the student's choice and the correct answer. */
export function ReviewList({ items }: { items: ResultReviewItem[] }) {
  return (
    <div className="stack">
      {items.map((item) => {
        const [color, label] = OUTCOME[item.outcome];
        return (
          <div className="card" key={item.questionVersionId}>
            <div className="row between">
              <strong>Question {item.position + 1}</strong>
              <span className="row">
                <span className={`badge ${color}`}>{label}</span>
                <span className="small muted">
                  {fmtScore(item.awarded)}/{fmtScore(item.marks)}
                </span>
              </span>
            </div>
            <div className="question-content mt">{item.content}</div>
            {item.options.map((o, i) => {
              const picked = item.selectedOptionIds.includes(o.id);
              const cls = o.isCorrect ? 'correct' : picked ? 'incorrect' : '';
              return (
                <div key={o.id} className={`option ${cls}`} style={{ cursor: 'default' }}>
                  <span className="key">{String.fromCharCode(65 + i)}</span>
                  <span style={{ flex: 1, paddingTop: 3 }}>{o.content}</span>
                  {picked && <span className="badge blue">Your answer</span>}
                  {o.isCorrect && <span className="badge green">Correct answer</span>}
                </div>
              );
            })}
            {item.explanation && (
              <div className="alert info mt" style={{ marginTop: 14 }}>
                <strong style={{ color: 'var(--primary)' }}>Explanation: </strong>
                <span>{item.explanation}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

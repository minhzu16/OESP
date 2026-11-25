import type { AttemptQuestionView } from '@exam/shared';
import { QueueStatus } from './autosaveQueue';

export function SaveIndicator({ status, online }: { status: QueueStatus; online: boolean }) {
  const label = !online
    ? 'Offline — saved on this device'
    : status === 'saving'
      ? 'Saving…'
      : status === 'retrying'
        ? 'Retrying…'
        : status === 'closed'
          ? 'Closed'
          : 'All answers saved';
  return (
    <span className={`save-status ${online ? status : 'retrying'}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

interface AttemptNavigatorProps {
  questions: AttemptQuestionView[];
  selections: Map<string, string[]>;
  current: number;
  flags: Set<string>;
  answeredCount: number;
  attemptNo: number;
  onSelect: (index: number) => void;
}

export function AttemptNavigator({
  questions,
  selections,
  current,
  flags,
  answeredCount,
  attemptNo,
  onSelect,
}: AttemptNavigatorProps) {
  return (
    <aside className="stack">
      <div className="card">
        <h3 style={{ fontSize: '0.98rem', marginBottom: 12 }}>Question Navigator</h3>
        <div className="palette">
          {questions.map((q, i) => {
            const answered = (selections.get(q.questionVersionId) ?? []).length > 0;
            const cls = [answered && 'answered', i === current && 'current', flags.has(q.questionVersionId) && 'flagged']
              .filter(Boolean)
              .join(' ');
            return (
              <button key={q.questionVersionId} className={cls} onClick={() => onSelect(i)} aria-label={`Question ${i + 1}`}>
                {i + 1}
              </button>
            );
          })}
        </div>
        <div className="legend">
          <span className="row" style={{ gap: 5 }}>
            <span className="badge blue" style={{ width: 8, height: 8, padding: 0 }} />
            <span>Answered ({answeredCount}/{questions.length})</span>
          </span>
          <span className="row" style={{ gap: 5 }}>
            <span className="badge amber" style={{ width: 8, height: 8, padding: 0 }} />
            <span>Flagged ({flags.size})</span>
          </span>
        </div>
      </div>
      <div className="card small muted" style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text)' }}>Exam Integrity & Autosave:</strong>
        <p style={{ margin: '6px 0 0', fontSize: '0.82rem' }}>
          Attempt #{attemptNo}. Answers sync continuously with the official server clock. When the countdown reaches zero, your responses are securely submitted automatically.
        </p>
      </div>
    </aside>
  );
}

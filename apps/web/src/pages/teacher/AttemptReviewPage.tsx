import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import type { AttemptStatus, ResultReviewItem } from '@exam/shared';
import { get, post } from '../../api/client';
import { ReviewList } from '../../components/ReviewList';
import { ErrorAlert, Modal, PageHead, Spinner, Stat, StatusBadge } from '../../components/ui';
import { fmtDateTime, fmtScore } from '../../lib/format';

interface TeacherAttempt {
  id: string;
  examId: string;
  examTitle: string;
  student: { email: string; fullName: string };
  attemptNo: number;
  status: AttemptStatus;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  submitReason: string | null;
  result: {
    score: number;
    maxScore: number;
    passed: boolean | null;
    correctCount: number;
    wrongCount: number;
    blankCount: number;
    gradedAt: string;
    version: number;
    integrityOk: boolean;
  } | null;
  review: ResultReviewItem[];
  audit: { id: string; action: string; reason: string | null; createdAt: string; oldValue: unknown; newValue: unknown; actor: { fullName: string } | null }[];
}

export function AttemptReviewPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const attempt = useQuery({ queryKey: ['attempt-review', id], queryFn: () => get<TeacherAttempt>(`/attempts/${id}/review`) });
  const [dialog, setDialog] = useState<'regrade' | 'extend' | null>(null);

  if (attempt.isLoading) return <Spinner />;
  if (attempt.error) return <ErrorAlert error={attempt.error} />;
  const a = attempt.data!;
  const onDone = (data: TeacherAttempt) => {
    qc.setQueryData(['attempt-review', id], data);
    void qc.invalidateQueries({ queryKey: ['exam', a.examId] });
    setDialog(null);
  };

  return (
    <>
      <PageHead
        title={`${a.student.fullName} — attempt #${a.attemptNo}`}
        subtitle={
          <>
            <Link to={`/teacher/exams/${a.examId}/results`}>← {a.examTitle}</Link> · {a.student.email}
          </>
        }
        actions={
          <>
            {a.status === 'IN_PROGRESS' && <button onClick={() => setDialog('extend')}>Extend time</button>}
            {a.result && (
              <button className="primary" onClick={() => setDialog('regrade')}>
                Regrade
              </button>
            )}
          </>
        }
      />
      {a.result && !a.result.integrityOk && (
        <div className="alert error" style={{ marginBottom: 16 }}>
          Integrity check failed: the stored result does not match its HMAC checksum. It may have been modified outside the application.
        </div>
      )}
      <div className="grid cols-4">
        <Stat label="Status" value={<StatusBadge status={a.status} />} />
        <Stat label="Score" value={a.result ? `${fmtScore(a.result.score)}/${fmtScore(a.result.maxScore)}` : '—'} />
        <Stat label="Started" value={<span className="small">{fmtDateTime(a.startedAt)}</span>} />
        <Stat label={a.submittedAt ? `Closed (${a.submitReason})` : 'Deadline'} value={<span className="small">{fmtDateTime(a.submittedAt ?? a.deadlineAt)}</span>} />
      </div>

      {a.audit.length > 0 && (
        <div className="card mt">
          <h3>Audit trail</h3>
          <table>
            <tbody>
              {a.audit.map((e) => (
                <tr key={e.id}>
                  <td className="small">{fmtDateTime(e.createdAt)}</td>
                  <td>
                    <span className="badge">{e.action}</span>
                  </td>
                  <td className="small">{e.actor?.fullName ?? 'system'}</td>
                  <td className="small">{e.reason}</td>
                  <td className="small muted">
                    {JSON.stringify(e.oldValue)} → {JSON.stringify(e.newValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginTop: 28 }}>Answers</h2>
      {a.review.length ? <ReviewList items={a.review} /> : <p className="muted">Not graded yet.</p>}

      {dialog === 'regrade' && a.result && (
        <RegradeDialog attempt={a} onClose={() => setDialog(null)} onDone={onDone} />
      )}
      {dialog === 'extend' && <ExtendDialog attemptId={a.id} onClose={() => setDialog(null)} onDone={onDone} />}
    </>
  );
}

function RegradeDialog({ attempt, onClose, onDone }: { attempt: TeacherAttempt; onClose: () => void; onDone: (a: TeacherAttempt) => void }) {
  const [mode, setMode] = useState<'RECOMPUTE' | 'OVERRIDE'>('OVERRIDE');
  const [score, setScore] = useState(String(attempt.result!.score));
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () =>
      post<TeacherAttempt>(`/attempts/${attempt.id}/regrade`, {
        mode,
        score: mode === 'OVERRIDE' ? Number(score) : undefined,
        reason,
        expectedVersion: attempt.result!.version,
      }),
    onSuccess: onDone,
  });
  return (
    <Modal title="Regrade attempt" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <ErrorAlert error={m.error} />
        <label className="check">
          <input type="radio" checked={mode === 'OVERRIDE'} onChange={() => setMode('OVERRIDE')} /> Set score manually
        </label>
        <label className="check">
          <input type="radio" checked={mode === 'RECOMPUTE'} onChange={() => setMode('RECOMPUTE')} /> Recompute from saved answers
        </label>
        {mode === 'OVERRIDE' && (
          <label className="field">
            New score (max {attempt.result!.maxScore})
            <input type="number" step={0.01} min={0} max={attempt.result!.maxScore} required value={score} onChange={(e) => setScore(e.target.value)} />
          </label>
        )}
        <label className="field">
          Reason <span className="hint">required, stored permanently in the audit log</span>
          <textarea required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={m.isPending}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ExtendDialog({ attemptId, onClose, onDone }: { attemptId: string; onClose: () => void; onDone: (a: TeacherAttempt) => void }) {
  const [minutes, setMinutes] = useState(5);
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => post<TeacherAttempt>(`/attempts/${attemptId}/extend`, { extraSeconds: minutes * 60, reason }),
    onSuccess: onDone,
  });
  return (
    <Modal title="Extend time" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <ErrorAlert error={m.error} />
        <label className="field">
          Extra minutes
          <input type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </label>
        <label className="field">
          Reason
          <textarea required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={m.isPending}>
            Extend
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import type { AttemptStatus, AttemptView, StudentExamDto } from '@exam/shared';
import { get, post } from '../../api/client';
import { Empty, ErrorAlert, PageHead, PhaseBadge, Spinner, StatusBadge } from '../../components/ui';
import { fmtDateTime, fmtMinutes, fmtScore } from '../../lib/format';

interface MyAttempt {
  id: string;
  examId: string;
  examTitle: string;
  attemptNo: number;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  released: boolean;
  score: number | null;
  maxScore: number | null;
  passed: boolean | null;
}

export function StudentDashboard() {
  const navigate = useNavigate();
  const exams = useQuery({ queryKey: ['me', 'exams'], queryFn: () => get<StudentExamDto[]>('/me/exams'), refetchInterval: 30_000 });
  const attempts = useQuery({ queryKey: ['me', 'attempts'], queryFn: () => get<MyAttempt[]>('/me/attempts') });
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function start(exam: StudentExamDto) {
    if (exam.activeAttemptId) {
      navigate(`/attempts/${exam.activeAttemptId}`);
      return;
    }
    if (!confirm(`Start "${exam.title}"? The ${fmtMinutes(exam.durationSeconds)} timer starts immediately and keeps running even if you close the page.`)) return;
    setStarting(exam.id);
    setError(null);
    try {
      const view = await post<AttemptView>(`/exams/${exam.id}/attempts`, { clientSessionId: crypto.randomUUID() });
      navigate(`/attempts/${view.id}`);
    } catch (err) {
      setError(err);
      void exams.refetch();
    } finally {
      setStarting(null);
    }
  }

  const list = exams.data ?? [];
  const current = list.filter((e) => e.phase === 'OPEN' || e.phase === 'SCHEDULED');
  const past = list.filter((e) => e.phase === 'CLOSED' || e.phase === 'ARCHIVED');

  return (
    <>
      <PageHead title="My exams" subtitle="Exams assigned to you. Times are shown in your local time zone." />
      <ErrorAlert error={error ?? exams.error} />
      {exams.isLoading ? (
        <Spinner />
      ) : current.length === 0 ? (
        <div className="card">
          <Empty>No open or upcoming exams.</Empty>
        </div>
      ) : (
        <div className="grid cols-2">
          {current.map((e) => (
            <div className="card stack" key={e.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div className="stack" style={{ gap: 10 }}>
                <div className="row between">
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{e.title}</h3>
                  <PhaseBadge phase={e.phase} />
                </div>
                {e.instructions && <p className="muted small" style={{ margin: 0 }}>{e.instructions}</p>}
                <div className="row" style={{ gap: 8, fontSize: '0.84rem' }}>
                  <span className="badge">{e.questionCount} questions</span>
                  <span className="badge">{fmtMinutes(e.durationSeconds)}</span>
                  <span className="badge">
                    Attempt {e.attemptsUsed} of {e.maxAttempts}
                  </span>
                </div>
                <div className="small muted">
                  Window: {fmtDateTime(e.startAt)} → {fmtDateTime(e.endAt)}
                </div>
              </div>
              <div className="row end" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                {e.activeAttemptId ? (
                  <button className="primary" onClick={() => start(e)}>
                    Resume attempt
                  </button>
                ) : e.phase === 'OPEN' && e.attemptsLeft > 0 ? (
                  <button className="primary" disabled={starting === e.id} onClick={() => start(e)}>
                    {starting === e.id ? 'Starting…' : e.attemptsUsed > 0 ? 'Start new attempt' : 'Begin exam'}
                  </button>
                ) : e.phase === 'SCHEDULED' ? (
                  <span className="muted small">Opens {fmtDateTime(e.startAt)}</span>
                ) : (
                  <span className="muted small">No attempts left</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt" style={{ marginTop: 36 }}>
        Attempt history
      </h2>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {attempts.isLoading ? (
          <Spinner />
        ) : (attempts.data ?? []).length === 0 ? (
          <Empty>You have not taken any exams yet.</Empty>
        ) : (
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Exam title</th>
                  <th>Attempt</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th className="num">Score</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {attempts.data!.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.examTitle}</td>
                    <td>#{a.attemptNo}</td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="small">{fmtDateTime(a.submittedAt)}</td>
                    <td className="num">
                      {a.released && a.score !== null ? (
                        <>
                          <strong>{fmtScore(a.score)}</strong>
                          <span className="muted">/{fmtScore(a.maxScore)}</span>{' '}
                          {a.passed !== null && (
                            <span className={`badge ${a.passed ? 'green' : 'red'}`} style={{ marginLeft: 6 }}>
                              {a.passed ? 'Pass' : 'Fail'}
                            </span>
                          )}
                        </>
                      ) : a.status === 'IN_PROGRESS' ? (
                        '—'
                      ) : (
                        <span className="muted small">Not released</span>
                      )}
                    </td>
                    <td>
                      {a.status === 'IN_PROGRESS' ? (
                        <Link to={`/attempts/${a.id}`} className="btn sm primary">Resume</Link>
                      ) : (
                        <Link to={`/attempts/${a.id}/result`} className="btn sm">View result</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {past.length > 0 && (
        <p className="muted small mt">
          Closed exams: {past.map((e) => e.title).join(', ')}
        </p>
      )}
    </>
  );
}

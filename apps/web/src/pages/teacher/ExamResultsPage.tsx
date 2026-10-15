import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import type { AttemptStatus } from '@exam/shared';
import { download, errorMessage, get } from '../../api/client';
import { Empty, ErrorAlert, PageHead, Spinner, Stat, StatusBadge } from '../../components/ui';
import { fmtDateTime, fmtDuration, fmtScore } from '../../lib/format';

interface Gradebook {
  title: string;
  gradingMethod: string;
  rows: {
    attemptId: string;
    studentName: string;
    studentEmail: string;
    attemptNo: number;
    status: AttemptStatus;
    startedAt: string;
    submittedAt: string | null;
    submitReason: string | null;
    durationSeconds: number | null;
    score: number | null;
    maxScore: number | null;
    percentage: number | null;
    passed: boolean | null;
  }[];
  students: {
    studentId: string;
    studentName: string;
    studentEmail: string;
    attempts: number;
    finalScore: number | null;
    maxScore: number | null;
    percentage: number | null;
    passed: boolean | null;
  }[];
}

interface Summary {
  students: number;
  gradedStudents: number;
  attempts: number;
  attemptsByStatus: Record<string, number>;
  averagePercentage: number | null;
  medianPercentage: number | null;
  minPercentage: number | null;
  maxPercentage: number | null;
  passRate: number | null;
  distribution: { from: number; to: number; count: number }[];
}

interface ItemRow {
  questionVersionId: string;
  version: number;
  type: string;
  content: string;
  responses: number;
  correctRate: number;
  blankRate: number;
  discrimination: number | null;
  flags: string[];
  options: { id: string; content: string; isCorrect: boolean; selected: number }[];
}

type Tab = 'students' | 'attempts' | 'items';

export function ExamResultsPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('students');
  const [exportError, setExportError] = useState<string | null>(null);
  const book = useQuery({ queryKey: ['exam', id, 'gradebook'], queryFn: () => get<Gradebook>(`/exams/${id}/results`), refetchInterval: 20_000 });
  const summary = useQuery({ queryKey: ['exam', id, 'summary'], queryFn: () => get<Summary>(`/exams/${id}/reports/summary`), refetchInterval: 20_000 });
  const items = useQuery({ queryKey: ['exam', id, 'items'], queryFn: () => get<ItemRow[]>(`/exams/${id}/reports/items`), enabled: tab === 'items' });

  if (book.isLoading) return <Spinner />;
  if (book.error) return <ErrorAlert error={book.error} />;
  const g = book.data!;
  const s = summary.data;
  const maxBucket = Math.max(1, ...(s?.distribution.map((d) => d.count) ?? [1]));

  const exportCsv = async (view: 'students' | 'attempts') => {
    setExportError(null);
    try {
      await download(`/exams/${id}/results?format=csv&view=${view}`, `${g.title}-${view}.csv`);
    } catch (err) {
      setExportError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHead
        title={`Results — ${g.title}`}
        subtitle={
          <>
            <Link to={`/teacher/exams/${id}`}>← Exam settings</Link> · final mark = {g.gradingMethod.toLowerCase()} attempt
          </>
        }
        actions={
          <>
            <button onClick={() => exportCsv('students')}>Export CSV (students)</button>
            <button onClick={() => exportCsv('attempts')}>Export CSV (attempts)</button>
          </>
        }
      />
      {exportError && <div className="alert error">{exportError}</div>}
      {s && (
        <div className="grid cols-4">
          <Stat label="Students graded" value={`${s.gradedStudents}/${s.students}`} />
          <Stat label="Average" value={s.averagePercentage === null ? '—' : `${s.averagePercentage}%`} />
          <Stat label="Median" value={s.medianPercentage === null ? '—' : `${fmtScore(s.medianPercentage)}%`} />
          <Stat label="Pass rate" value={s.passRate === null ? '—' : `${s.passRate}%`} />
        </div>
      )}
      {s && s.gradedStudents > 0 && (
        <div className="card mt">
          <div className="row between">
            <h3 style={{ margin: 0 }}>Score distribution</h3>
            <span className="small muted">
              In progress: {s.attemptsByStatus.IN_PROGRESS ?? 0} · range {fmtScore(s.minPercentage)}–{fmtScore(s.maxPercentage)}%
            </span>
          </div>
          <div className="bars" aria-label="Score distribution">
            {s.distribution.map((d) => (
              <div key={d.from} className="bar" style={{ height: `${(d.count / maxBucket) * 100}%` }} title={`${d.from}–${d.to}%: ${d.count}`}>
                {d.count > 0 && <span>{d.count}</span>}
              </div>
            ))}
          </div>
          <div className="bar-labels">
            {s.distribution.map((d) => (
              <span key={d.from}>{d.from}</span>
            ))}
          </div>
        </div>
      )}

      <div className="row mt">
        {(['students', 'attempts', 'items'] as const).map((t) => (
          <button key={t} className={tab === t ? 'primary sm' : 'sm'} onClick={() => setTab(t)}>
            {t === 'students' ? 'By student' : t === 'attempts' ? 'All attempts' : 'Item analysis'}
          </button>
        ))}
      </div>

      <div className="card mt">
        {tab === 'students' &&
          (g.students.length === 0 ? (
            <Empty>No attempts yet.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th className="num">Attempts</th>
                    <th className="num">Final score</th>
                    <th className="num">%</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {g.students.map((r) => (
                    <tr key={r.studentId}>
                      <td>
                        {r.studentName}
                        <div className="small muted">{r.studentEmail}</div>
                      </td>
                      <td className="num">{r.attempts}</td>
                      <td className="num">
                        {fmtScore(r.finalScore)}/{fmtScore(r.maxScore)}
                      </td>
                      <td className="num">{fmtScore(r.percentage)}</td>
                      <td>{r.passed === null ? '—' : <span className={`badge ${r.passed ? 'green' : 'red'}`}>{r.passed ? 'PASS' : 'FAIL'}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {tab === 'attempts' &&
          (g.rows.length === 0 ? (
            <Empty>No attempts yet.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>#</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Time used</th>
                    <th>Closed by</th>
                    <th className="num">Score</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.attemptId}>
                      <td>{r.studentName}</td>
                      <td>{r.attemptNo}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="small">{fmtDateTime(r.startedAt)}</td>
                      <td>{r.durationSeconds === null ? '—' : fmtDuration(r.durationSeconds)}</td>
                      <td className="small">{r.submitReason ?? '—'}</td>
                      <td className="num">
                        {fmtScore(r.score)}/{fmtScore(r.maxScore)}
                      </td>
                      <td>
                        <Link to={`/teacher/attempts/${r.attemptId}`}>Review</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {tab === 'items' &&
          (items.isLoading ? (
            <Spinner />
          ) : (items.data ?? []).length === 0 ? (
            <Empty>No graded attempts yet.</Empty>
          ) : (
            <>
              <p className="small muted">
                Correct rate (p) = share answering correctly. Discrimination (D) = p(top 27%) − p(bottom 27%); below 0.2 suggests a weak item,
                negative suggests a wrong key or a misleading question. Sorted hardest first.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th className="num">n</th>
                      <th>Correct rate</th>
                      <th className="num">D</th>
                      <th>Option choices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.data!.map((it) => (
                      <tr key={it.questionVersionId}>
                        <td style={{ maxWidth: 320 }}>
                          {it.content}
                          <div>
                            {it.flags.map((f) => (
                              <span key={f} className="badge amber" style={{ marginRight: 4 }}>
                                {f.replace(/_/g, ' ').toLowerCase()}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="num">{it.responses}</td>
                        <td>
                          <div className="row" style={{ flexWrap: 'nowrap' }}>
                            <div className="meter">
                              <div style={{ width: `${it.correctRate * 100}%` }} />
                            </div>
                            <span className="small">{Math.round(it.correctRate * 100)}%</span>
                          </div>
                        </td>
                        <td className="num">{it.discrimination ?? '—'}</td>
                        <td className="small">
                          {it.options.map((o, i) => (
                            <div key={o.id} style={{ color: o.isCorrect ? 'var(--success)' : undefined }}>
                              {String.fromCharCode(65 + i)}. {o.content} — {o.selected}
                              {o.isCorrect && ' ✓'}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ))}
      </div>
    </>
  );
}

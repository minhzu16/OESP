import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import type { AttemptResultDto } from '@exam/shared';
import { get } from '../../api/client';
import { ReviewList } from '../../components/ReviewList';
import { ErrorAlert, PageHead, Spinner, Stat, StatusBadge } from '../../components/ui';
import { fmtDateTime, fmtScore } from '../../lib/format';

export function ResultPage() {
  const { id = '' } = useParams();
  const result = useQuery({
    queryKey: ['me', 'result', id],
    queryFn: () => get<AttemptResultDto>(`/attempts/${id}/result`),
    // Poll until released so the page updates when the teacher publishes results.
    refetchInterval: (q) => (q.state.data?.released ? false : 30_000),
  });

  if (result.isLoading) return <Spinner />;
  if (result.error) return <ErrorAlert error={result.error} />;
  const r = result.data!;

  return (
    <>
      <PageHead
        title={r.examTitle}
        subtitle={
          <span className="row">
            <StatusBadge status={r.status} /> <Link to="/student">← Back to my exams</Link>
          </span>
        }
      />
      {!r.released ? (
        <div className="card" style={{ padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: 12, background: 'var(--success-soft)', borderRadius: '50%', marginBottom: 14 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 style={{ marginBottom: 6 }}>Attempt submitted & recorded</h2>
          <p className="muted" style={{ maxWidth: '52ch', margin: '0 auto 16px' }}>
            {r.resultsReleaseAt
              ? `Official grades and review answers will be published on ${fmtDateTime(r.resultsReleaseAt)}.`
              : 'Your responses have been securely preserved. Results will be published by your instructor.'}
          </p>
          <Link to="/student" className="btn sm">
            Return to my exams
          </Link>
        </div>
      ) : (
        <>
          <div className="grid cols-4">
            <Stat label="Total score" value={`${fmtScore(r.score)} / ${fmtScore(r.maxScore)}`} />
            <Stat label="Score percentage" value={`${fmtScore(r.percentage)}%`} />
            <Stat label="Breakdown (Correct / Wrong / Blank)" value={`${r.correctCount} / ${r.wrongCount} / ${r.blankCount}`} />
            <Stat
              label="Evaluation outcome"
              value={
                r.passed === null || r.passed === undefined ? (
                  '—'
                ) : r.passed ? (
                  <span style={{ color: 'var(--success)', fontWeight: 800 }}>Passed</span>
                ) : (
                  <span style={{ color: 'var(--danger)', fontWeight: 800 }}>Failed</span>
                )
              }
            />
          </div>
          <h2 style={{ marginTop: 36, marginBottom: 16 }}>Question-by-question review</h2>
          <ReviewList items={r.review ?? []} />
        </>
      )}
    </>
  );
}

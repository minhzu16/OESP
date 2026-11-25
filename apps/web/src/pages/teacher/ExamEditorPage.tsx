import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { del, get, post } from '../../api/client';
import { ErrorAlert, PageHead, PhaseBadge, Spinner } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { AssignmentsCard } from './exam-editor/AssignmentsCard';
import type { ExamDetail } from './exam-editor/examEditorTypes';
import { FixedQuestionsCard } from './exam-editor/FixedQuestionsCard';
import { SectionsCard } from './exam-editor/SectionsCard';
import { SettingsCard } from './exam-editor/SettingsCard';

export function ExamEditorPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const exam = useQuery({ queryKey: ['exam', id], queryFn: () => get<ExamDetail>(`/exams/${id}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['exam', id] });
    void qc.invalidateQueries({ queryKey: ['exams'] });
  };
  const action = useMutation({
    mutationFn: (kind: 'publish' | 'archive' | 'release-results' | 'delete') =>
      kind === 'delete' ? del(`/exams/${id}`) : post(`/exams/${id}/${kind}`),
    onSuccess: (_, kind) => (kind === 'delete' ? navigate('/teacher/exams') : refresh()),
  });

  if (exam.isLoading) return <Spinner />;
  if (exam.error) return <ErrorAlert error={exam.error} />;
  const e = exam.data!;
  const draft = e.status === 'DRAFT';

  return (
    <>
      <PageHead
        title={
          <span className="row">
            {e.title} <PhaseBadge phase={e.phase} />
          </span>
        }
        subtitle={
          <>
            <Link to="/teacher/exams">Exams</Link> · {e.questionCount} questions per attempt · {e.attemptCount} attempts
          </>
        }
        actions={
          <>
            {draft && (
              <>
                <button className="danger" onClick={() => confirm('Delete this draft?') && action.mutate('delete')}>
                  Delete
                </button>
                <button
                  className="primary"
                  disabled={action.isPending}
                  onClick={() => confirm('Publish? Questions will be frozen and cannot be changed afterwards.') && action.mutate('publish')}
                >
                  Publish
                </button>
              </>
            )}
            {e.status === 'PUBLISHED' && (
              <>
                <Link className="btn" to={`/teacher/exams/${id}/results`}>
                  Results
                </Link>
                <button onClick={() => action.mutate('release-results')} disabled={!!e.resultsReleaseAt && new Date(e.resultsReleaseAt) <= new Date()}>
                  Release results now
                </button>
                <button onClick={() => confirm('Archive this exam?') && action.mutate('archive')}>Archive</button>
              </>
            )}
          </>
        }
      />
      <ErrorAlert error={action.error} />
      {!draft && (
        <div className="alert info" style={{ marginBottom: 16 }}>
          Published {fmtDateTime(e.publishedAt)}. Content is frozen; only title, instructions, schedule and attempt limit can change.
        </div>
      )}
      <div className="grid cols-2">
        <SettingsCard exam={e} onSaved={refresh} />
        <div className="stack">
          <SectionsCard exam={e} onSaved={refresh} />
          <FixedQuestionsCard exam={e} onSaved={refresh} />
        </div>
      </div>
      <AssignmentsCard examId={id} disabled={e.status === 'ARCHIVED'} />
    </>
  );
}

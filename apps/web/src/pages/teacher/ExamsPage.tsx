import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import type { ExamDto } from '@exam/shared';
import { get, post } from '../../api/client';
import { Empty, ErrorAlert, Modal, PageHead, PhaseBadge, Spinner } from '../../components/ui';
import { fmtDateTime, fmtMinutes, fromLocalInput, toLocalInput } from '../../lib/format';

export function ExamsPage() {
  const navigate = useNavigate();
  const exams = useQuery({ queryKey: ['exams'], queryFn: () => get<ExamDto[]>('/exams') });
  const [creating, setCreating] = useState(false);
  const inAnHour = new Date(Date.now() + 3600_000);
  const [form, setForm] = useState({
    title: '',
    durationMinutes: 45,
    startAt: toLocalInput(new Date().toISOString()),
    endAt: toLocalInput(new Date(inAnHour.getTime() + 7 * 86_400_000).toISOString()),
  });

  const create = useMutation({
    mutationFn: () =>
      post<ExamDto>('/exams', {
        title: form.title,
        durationSeconds: form.durationMinutes * 60,
        startAt: fromLocalInput(form.startAt),
        endAt: fromLocalInput(form.endAt),
      }),
    onSuccess: (exam) => navigate(`/teacher/exams/${exam.id}`),
  });

  return (
    <>
      <PageHead
        title="Exams"
        subtitle="Draft → configure questions → publish → assign. Status is computed from the server clock."
        actions={
          <button className="primary" onClick={() => setCreating(true)}>
            New exam
          </button>
        }
      />
      <ErrorAlert error={exams.error} />
      <div className="card">
        {exams.isLoading ? (
          <Spinner />
        ) : (exams.data ?? []).length === 0 ? (
          <Empty>No exams yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Window</th>
                  <th>Duration</th>
                  <th className="num">Questions</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {exams.data!.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link to={`/teacher/exams/${e.id}`}>{e.title}</Link>
                    </td>
                    <td>
                      <PhaseBadge phase={e.phase} />
                    </td>
                    <td className="small">
                      {fmtDateTime(e.startAt)} → {fmtDateTime(e.endAt)}
                    </td>
                    <td>{fmtMinutes(e.durationSeconds)}</td>
                    <td className="num">{e.questionCount}</td>
                    <td>{e.status !== 'DRAFT' && <Link to={`/teacher/exams/${e.id}/results`}>Results</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <Modal title="New exam" onClose={() => setCreating(false)}>
          <form
            className="stack"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <ErrorAlert error={create.error} />
            <label className="field">
              Title
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="field">
              Duration (minutes)
              <input
                type="number"
                min={1}
                max={1440}
                required
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
              />
            </label>
            <div className="grid cols-2">
              <label className="field">
                Opens
                <input type="datetime-local" required value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
              </label>
              <label className="field">
                Closes
                <input type="datetime-local" required value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
              </label>
            </div>
            <div className="actions">
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="primary" disabled={create.isPending}>
                Create draft
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

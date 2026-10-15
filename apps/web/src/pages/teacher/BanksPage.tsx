import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { get, post } from '../../api/client';
import { Empty, ErrorAlert, Modal, PageHead, Spinner } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';

export interface Subject {
  id: string;
  code: string;
  name: string;
}

interface BankSummary {
  id: string;
  name: string;
  description: string | null;
  subject: Subject;
  questionCount: number;
  updatedAt: string;
}

export function BanksPage() {
  const qc = useQueryClient();
  const banks = useQuery({ queryKey: ['banks'], queryFn: () => get<BankSummary[]>('/banks') });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => get<Subject[]>('/subjects') });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subjectId: '', name: '', description: '', newCode: '', newName: '' });

  const create = useMutation({
    mutationFn: async () => {
      let subjectId = form.subjectId;
      if (subjectId === '__new') {
        subjectId = (await post<Subject>('/subjects', { code: form.newCode, name: form.newName })).id;
      }
      return post('/banks', { subjectId, name: form.name, description: form.description || undefined });
    },
    onSuccess: () => {
      setCreating(false);
      setForm({ subjectId: '', name: '', description: '', newCode: '', newName: '' });
      void qc.invalidateQueries({ queryKey: ['banks'] });
      void qc.invalidateQueries({ queryKey: ['subjects'] });
    },
  });

  return (
    <>
      <PageHead
        title="Question banks"
        subtitle="Questions are versioned: edits never change exams that were already published."
        actions={
          <button className="primary" onClick={() => setCreating(true)}>
            New bank
          </button>
        }
      />
      <ErrorAlert error={banks.error} />
      {banks.isLoading ? (
        <Spinner />
      ) : (banks.data ?? []).length === 0 ? (
        <div className="card">
          <Empty>No question banks yet.</Empty>
        </div>
      ) : (
        <div className="grid cols-3">
          {banks.data!.map((b) => (
            <Link to={`/teacher/banks/${b.id}`} key={b.id} className="card" style={{ color: 'inherit', textDecoration: 'none' }}>
              <div className="row between">
                <h3 style={{ margin: 0 }}>{b.name}</h3>
                <span className="badge blue">{b.subject.code}</span>
              </div>
              {b.description && <p className="muted small mt">{b.description}</p>}
              <p className="small mt">
                <strong>{b.questionCount}</strong> questions · <span className="muted">updated {fmtDateTime(b.updatedAt)}</span>
              </p>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="New question bank" onClose={() => setCreating(false)}>
          <form
            className="stack"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <ErrorAlert error={create.error} />
            <label className="field">
              Subject
              <select required value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                <option value="">Choose…</option>
                {(subjects.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
                <option value="__new">+ New subject…</option>
              </select>
            </label>
            {form.subjectId === '__new' && (
              <div className="grid cols-2">
                <label className="field">
                  Subject code
                  <input required pattern="[A-Za-z0-9_-]{1,32}" value={form.newCode} onChange={(e) => setForm({ ...form, newCode: e.target.value })} />
                </label>
                <label className="field">
                  Subject name
                  <input required value={form.newName} onChange={(e) => setForm({ ...form, newName: e.target.value })} />
                </label>
              </div>
            )}
            <label className="field">
              Bank name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              Description
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="actions">
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="primary" disabled={create.isPending}>
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

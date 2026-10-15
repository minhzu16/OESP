import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '../../api/client';
import { Empty, ErrorAlert, PageHead, Spinner } from '../../components/ui';

interface ClassSummary {
  id: string;
  name: string;
  _count: { members: number };
}

interface ClassDetail {
  id: string;
  name: string;
  members: { id: string; email: string; fullName: string }[];
}

export function ClassesPage() {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => get<ClassSummary[]>('/classes') });
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => post<ClassSummary>('/classes', { name }),
    onSuccess: (c) => {
      setName('');
      setSelected(c.id);
      void qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });

  return (
    <>
      <PageHead title="Classes" subtitle="Group students to assign exams to a whole class at once." />
      <div className="grid cols-2">
        <div className="card stack">
          <form
            className="row"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <input placeholder="New class name" required value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, width: 'auto' }} />
            <button className="primary" disabled={create.isPending}>
              Create
            </button>
          </form>
          <ErrorAlert error={create.error ?? classes.error} />
          {classes.isLoading ? (
            <Spinner />
          ) : (classes.data ?? []).length === 0 ? (
            <Empty>No classes yet.</Empty>
          ) : (
            <table>
              <tbody>
                {classes.data!.map((c) => (
                  <tr key={c.id} onClick={() => setSelected(c.id)} style={{ cursor: 'pointer', fontWeight: selected === c.id ? 600 : undefined }}>
                    <td>{c.name}</td>
                    <td className="num muted">{c._count.members} students</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {selected && <ClassMembers id={selected} onDeleted={() => setSelected(null)} />}
      </div>
    </>
  );
}

function ClassMembers({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const cls = useQuery({ queryKey: ['class', id], queryFn: () => get<ClassDetail>(`/classes/${id}`) });
  const [emails, setEmails] = useState('');
  const [notFound, setNotFound] = useState<string[]>([]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['class', id] });
    void qc.invalidateQueries({ queryKey: ['classes'] });
  };
  const add = useMutation({
    mutationFn: () =>
      post<{ added: number; notFound: string[] }>(`/classes/${id}/members`, {
        emails: emails.split(/[\s,;]+/).filter(Boolean),
      }),
    onSuccess: (r) => {
      setNotFound(r.notFound);
      setEmails('');
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (uid: string) => del(`/classes/${id}/members/${uid}`), onSuccess: refresh });
  const destroy = useMutation({
    mutationFn: () => del(`/classes/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['classes'] });
      onDeleted();
    },
  });

  if (cls.isLoading) return <Spinner />;
  const c = cls.data!;
  return (
    <div className="card stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{c.name}</h2>
        <button className="danger sm" onClick={() => confirm('Delete class?') && destroy.mutate()}>
          Delete class
        </button>
      </div>
      <ErrorAlert error={add.error ?? remove.error ?? destroy.error} />
      <label className="field">
        Add students by email <span className="hint">separate with commas or new lines; students must have an account</span>
        <textarea rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} />
      </label>
      <div className="row end">
        <button className="primary sm" disabled={!emails.trim() || add.isPending} onClick={() => add.mutate()}>
          Add
        </button>
      </div>
      {notFound.length > 0 && <div className="alert warn small">No student account for: {notFound.join(', ')}</div>}
      {c.members.length === 0 ? (
        <Empty>No students in this class.</Empty>
      ) : (
        <table>
          <tbody>
            {c.members.map((m) => (
              <tr key={m.id}>
                <td>{m.fullName}</td>
                <td className="muted small">{m.email}</td>
                <td>
                  <button className="ghost sm" onClick={() => remove.mutate(m.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

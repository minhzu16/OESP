import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Paginated, UserDto } from '@exam/shared';
import { del, get, post } from '../../../api/client';
import { Empty, ErrorAlert } from '../../../components/ui';
import type { Assignment } from './examEditorTypes';

export function AssignmentsCard({ examId, disabled }: { examId: string; disabled: boolean }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['exam', examId, 'assignments'], queryFn: () => get<Assignment[]>(`/exams/${examId}/assignments`) });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => get<{ id: string; name: string }[]>('/classes') });
  const [search, setSearch] = useState('');
  const students = useQuery({
    queryKey: ['students', search],
    queryFn: () => get<Paginated<UserDto>>(`/students?pageSize=10&search=${encodeURIComponent(search)}`),
    enabled: search.length >= 2,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['exam', examId] });
  const assign = useMutation({
    mutationFn: (body: { studentIds?: string[]; classIds?: string[] }) => post(`/exams/${examId}/assignments`, body),
    onSuccess: refresh,
  });
  const unassign = useMutation({ mutationFn: (aid: string) => del(`/exams/${examId}/assignments/${aid}`), onSuccess: refresh });

  return (
    <div className="card stack mt">
      <h2>Assigned to</h2>
      <ErrorAlert error={assign.error ?? unassign.error} />
      {!disabled && (
        <div className="grid cols-2">
          <label className="field">
            Assign a class
            <select value="" onChange={(e) => e.target.value && assign.mutate({ classIds: [e.target.value] })}>
              <option value="">Choose class…</option>
              {(classes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Assign a student
            <input placeholder="Type name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search.length >= 2 && (students.data?.items ?? []).length > 0 && (
              <div className="card" style={{ padding: 6 }}>
                {students.data!.items.map((s) => (
                  <button
                    key={s.id}
                    className="ghost sm"
                    style={{ display: 'block', width: '100%', textAlign: 'left' }}
                    onClick={() => {
                      assign.mutate({ studentIds: [s.id] });
                      setSearch('');
                    }}
                  >
                    {s.fullName} <span className="muted">{s.email}</span>
                  </button>
                ))}
              </div>
            )}
          </label>
        </div>
      )}
      {(list.data ?? []).length === 0 ? (
        <Empty>Not assigned yet — students cannot see this exam.</Empty>
      ) : (
        <div className="row">
          {list.data!.map((a) => (
            <span key={a.id} className="badge blue" style={{ padding: '4px 10px' }}>
              {a.class ? `Class ${a.class.name} (${a.class._count.members})` : `${a.student!.fullName}`}
              {!disabled && (
                <button className="ghost sm" style={{ padding: '0 0 0 6px' }} onClick={() => unassign.mutate(a.id)} aria-label="Remove">
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

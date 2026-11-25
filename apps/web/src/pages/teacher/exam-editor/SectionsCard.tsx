import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { get, put } from '../../../api/client';
import { Empty, ErrorAlert } from '../../../components/ui';
import type { BankSummary, ExamDetail } from './examEditorTypes';

export function SectionsCard({ exam, onSaved }: { exam: ExamDetail; onSaved: () => void }) {
  const draft = exam.status === 'DRAFT';
  const banks = useQuery({ queryKey: ['banks'], queryFn: () => get<BankSummary[]>('/banks'), enabled: draft });
  const [rows, setRows] = useState(() =>
    exam.sections.map((s) => ({ bankId: s.bankId, difficulty: s.difficulty ?? '', tag: s.tag ?? '', pickCount: s.pickCount })),
  );
  const save = useMutation({
    mutationFn: () =>
      put(`/exams/${exam.id}/sections`, {
        sections: rows.map((r) => ({
          bankId: r.bankId,
          difficulty: r.difficulty === '' ? null : Number(r.difficulty),
          tag: r.tag || null,
          pickCount: Number(r.pickCount),
        })),
      }),
    onSuccess: onSaved,
  });

  return (
    <div className="card stack">
      <h2>Random draw rules</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Each attempt draws its own random questions. The candidate pool is frozen when the exam is published.
      </p>
      <ErrorAlert error={save.error} />
      {!draft ? (
        exam.sections.length === 0 ? (
          <Empty>No random sections.</Empty>
        ) : (
          <table>
            <tbody>
              {exam.sections.map((s) => (
                <tr key={s.id}>
                  <td>{s.bankName}</td>
                  <td className="small">
                    {s.difficulty ? `difficulty ${s.difficulty}` : 'any difficulty'}
                    {s.tag ? ` · #${s.tag}` : ''}
                  </td>
                  <td className="num">
                    pick {s.pickCount} of {s.frozenPoolSize}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <>
          {rows.map((r, i) => (
            <div className="row" key={i}>
              <select value={r.bankId} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, bankId: e.target.value } : x)))} style={{ flex: 2, width: 'auto' }}>
                <option value="">Bank…</option>
                {(banks.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.questionCount})
                  </option>
                ))}
              </select>
              <select value={r.difficulty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, difficulty: e.target.value } : x)))} style={{ flex: 1, width: 'auto' }}>
                <option value="">Any diff.</option>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    Diff. {d}
                  </option>
                ))}
              </select>
              <input placeholder="tag" value={r.tag} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)))} style={{ flex: 1, width: 'auto' }} />
              <input type="number" min={1} value={r.pickCount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pickCount: Number(e.target.value) } : x)))} style={{ width: 70 }} aria-label="Pick count" />
              <button className="ghost sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <div className="row between">
            <button className="sm" onClick={() => setRows([...rows, { bankId: banks.data?.[0]?.id ?? '', difficulty: '', tag: '', pickCount: 5 }])}>
              + Add rule
            </button>
            <button className="primary sm" disabled={save.isPending || rows.some((r) => !r.bankId)} onClick={() => save.mutate()}>
              Save rules
            </button>
          </div>
        </>
      )}
    </div>
  );
}

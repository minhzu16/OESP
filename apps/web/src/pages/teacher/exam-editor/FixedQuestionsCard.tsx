import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Paginated, QuestionDto } from '@exam/shared';
import { get, put } from '../../../api/client';
import { Empty, ErrorAlert, Modal, Spinner } from '../../../components/ui';
import type { BankSummary, ExamDetail } from './examEditorTypes';

export function FixedQuestionsCard({ exam, onSaved }: { exam: ExamDetail; onSaved: () => void }) {
  const draft = exam.status === 'DRAFT';
  const [picking, setPicking] = useState(false);
  const save = useMutation({
    mutationFn: (questionIds: string[]) => put(`/exams/${exam.id}/fixed-questions`, { questionIds }),
    onSuccess: onSaved,
  });
  const ids = exam.fixedQuestions.map((q) => q.questionId);

  return (
    <div className="card stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Fixed questions</h2>
        {draft && (
          <button className="sm" onClick={() => setPicking(true)}>
            + Add from bank
          </button>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Included in every attempt.
      </p>
      <ErrorAlert error={save.error} />
      {exam.fixedQuestions.length === 0 ? (
        <Empty>No fixed questions.</Empty>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {exam.fixedQuestions.map((q) => (
            <li key={q.questionId} className="small" style={{ marginBottom: 6 }}>
              {q.content} <span className="muted">({q.marks} pt)</span>
              {draft && (
                <button className="ghost sm" onClick={() => save.mutate(ids.filter((x) => x !== q.questionId))}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {picking && (
        <QuestionPicker
          selected={ids}
          onClose={() => setPicking(false)}
          onPick={(added) => {
            save.mutate([...ids, ...added.filter((x) => !ids.includes(x))]);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

function QuestionPicker({ selected, onPick, onClose }: { selected: string[]; onPick: (ids: string[]) => void; onClose: () => void }) {
  const banks = useQuery({ queryKey: ['banks'], queryFn: () => get<BankSummary[]>('/banks') });
  const [bankId, setBankId] = useState('');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const questions = useQuery({
    queryKey: ['bank', bankId, 'picker', search],
    queryFn: () => get<Paginated<QuestionDto>>(`/banks/${bankId}/questions?pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    enabled: !!bankId,
  });
  return (
    <Modal title="Add fixed questions" onClose={onClose} wide>
      <div className="row">
        <select value={bankId} onChange={(e) => setBankId(e.target.value)} style={{ maxWidth: 300 }}>
          <option value="">Choose bank…</option>
          {(banks.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
      </div>
      <div style={{ maxHeight: 380, overflowY: 'auto', marginTop: 12 }}>
        {questions.isLoading && <Spinner />}
        {(questions.data?.items ?? []).map((q) => (
          <label key={q.id} className="check" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <input
              type="checkbox"
              disabled={selected.includes(q.id)}
              checked={selected.includes(q.id) || chosen.includes(q.id)}
              onChange={(e) => setChosen(e.target.checked ? [...chosen, q.id] : chosen.filter((x) => x !== q.id))}
            />
            <span>
              {q.content} <span className="muted small">· {q.type} · diff {q.difficulty}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={chosen.length === 0} onClick={() => onPick(chosen)}>
          Add {chosen.length || ''}
        </button>
      </div>
    </Modal>
  );
}

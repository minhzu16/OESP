import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import type { ExamDto, GradingMethod, Paginated, QuestionDto, UserDto } from '@exam/shared';
import { del, get, patch, post, put } from '../../api/client';
import { Empty, ErrorAlert, Modal, PageHead, PhaseBadge, Spinner } from '../../components/ui';
import { fmtDateTime, fromLocalInput, toLocalInput } from '../../lib/format';

interface ExamDetail extends ExamDto {
  assignmentCount: number;
  attemptCount: number;
  sections: { id: string; bankId: string; bankName: string; difficulty: number | null; tag: string | null; pickCount: number; frozenPoolSize: number | null }[];
  fixedQuestions: { questionId: string; content: string; type: string; marks: number; isDeleted: boolean }[];
}

interface BankSummary {
  id: string;
  name: string;
  questionCount: number;
}

interface Assignment {
  id: string;
  student: { id: string; email: string; fullName: string } | null;
  class: { id: string; name: string; _count: { members: number } } | null;
}

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

function SettingsCard({ exam, onSaved }: { exam: ExamDetail; onSaved: () => void }) {
  const draft = exam.status === 'DRAFT';
  const locked = exam.status === 'ARCHIVED';
  const initial = () => ({
    title: exam.title,
    instructions: exam.instructions ?? '',
    durationMinutes: Math.round(exam.durationSeconds / 60),
    startAt: toLocalInput(exam.startAt),
    endAt: toLocalInput(exam.endAt),
    resultsReleaseAt: toLocalInput(exam.resultsReleaseAt),
    maxAttempts: exam.maxAttempts,
    gradingMethod: exam.gradingMethod,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
    partialCredit: exam.partialCredit,
    passMark: exam.passMark === null ? '' : String(exam.passMark),
  });
  const [f, setF] = useState(initial);
  // Re-sync the form whenever the server copy changes.
  useEffect(() => setF(initial()), [exam.version]);

  const save = useMutation({
    mutationFn: () => {
      const schedule = {
        version: exam.version,
        title: f.title,
        instructions: f.instructions,
        startAt: fromLocalInput(f.startAt),
        endAt: fromLocalInput(f.endAt),
        resultsReleaseAt: fromLocalInput(f.resultsReleaseAt),
        maxAttempts: f.maxAttempts,
      };
      return patch(
        `/exams/${exam.id}`,
        draft
          ? {
              ...schedule,
              durationSeconds: f.durationMinutes * 60,
              gradingMethod: f.gradingMethod,
              shuffleQuestions: f.shuffleQuestions,
              shuffleOptions: f.shuffleOptions,
              partialCredit: f.partialCredit,
              passMark: f.passMark === '' ? null : Number(f.passMark),
            }
          : schedule,
      );
    },
    onSuccess: onSaved,
  });

  return (
    <form
      className="card stack"
      onSubmit={(ev: FormEvent) => {
        ev.preventDefault();
        save.mutate();
      }}
    >
      <h2>Settings</h2>
      <ErrorAlert error={save.error} />
      <fieldset disabled={locked} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <label className="field">
          Title
          <input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </label>
        <label className="field">
          Instructions
          <textarea value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
        </label>
        <div className="grid cols-2">
          <label className="field">
            Opens
            <input type="datetime-local" required value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} />
          </label>
          <label className="field">
            Closes
            <input type="datetime-local" required value={f.endAt} onChange={(e) => setF({ ...f, endAt: e.target.value })} />
          </label>
          <label className="field">
            Results released <span className="hint">empty = manual</span>
            <input type="datetime-local" value={f.resultsReleaseAt} onChange={(e) => setF({ ...f, resultsReleaseAt: e.target.value })} />
          </label>
          <label className="field">
            Max attempts
            <input type="number" min={1} max={100} value={f.maxAttempts} onChange={(e) => setF({ ...f, maxAttempts: Number(e.target.value) })} />
          </label>
          <label className="field">
            Duration (minutes)
            <input type="number" min={1} disabled={!draft} value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: Number(e.target.value) })} />
          </label>
          <label className="field">
            Grading method
            <select disabled={!draft} value={f.gradingMethod} onChange={(e) => setF({ ...f, gradingMethod: e.target.value as GradingMethod })}>
              <option value="HIGHEST">Highest attempt</option>
              <option value="LAST">Last attempt</option>
              <option value="FIRST">First attempt</option>
              <option value="AVERAGE">Average</option>
            </select>
          </label>
          <label className="field">
            Pass mark <span className="hint">points; empty = none</span>
            <input type="number" min={0} step={0.01} disabled={!draft} value={f.passMark} onChange={(e) => setF({ ...f, passMark: e.target.value })} />
          </label>
        </div>
        <div className="row">
          <label className="check">
            <input type="checkbox" disabled={!draft} checked={f.shuffleQuestions} onChange={(e) => setF({ ...f, shuffleQuestions: e.target.checked })} /> Shuffle questions
          </label>
          <label className="check">
            <input type="checkbox" disabled={!draft} checked={f.shuffleOptions} onChange={(e) => setF({ ...f, shuffleOptions: e.target.checked })} /> Shuffle options
          </label>
          <label className="check">
            <input type="checkbox" disabled={!draft} checked={f.partialCredit} onChange={(e) => setF({ ...f, partialCredit: e.target.checked })} /> Partial credit (multiple choice)
          </label>
        </div>
        <p className="small muted">
          Each attempt's deadline is min(start + duration, close time), set by the server when the attempt starts.
        </p>
        <div className="row end">
          <button className="primary" disabled={save.isPending}>
            Save settings
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function SectionsCard({ exam, onSaved }: { exam: ExamDetail; onSaved: () => void }) {
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

function FixedQuestionsCard({ exam, onSaved }: { exam: ExamDetail; onSaved: () => void }) {
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

function AssignmentsCard({ examId, disabled }: { examId: string; disabled: boolean }) {
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

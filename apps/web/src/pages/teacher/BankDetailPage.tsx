import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import type { Paginated, QuestionDto, QuestionInput } from '@exam/shared';
import { del, get, post, put } from '../../api/client';
import { Empty, ErrorAlert, Modal, PageHead, Spinner } from '../../components/ui';
import { QuestionEditor } from './QuestionEditor';
import type { Subject } from './BanksPage';

interface BankDetail {
  id: string;
  name: string;
  description: string | null;
  subject: Subject;
  tags: { tag: string; count: number }[];
  difficulty: { difficulty: number; count: number }[];
}

interface ImportResult {
  dryRun: boolean;
  parsed: number;
  created: number;
  wouldCreate: number;
  duplicates: { item: number; content: string }[];
  errors: { item: number; message: string }[];
}

const SAMPLE_TEXT = `What is 2 + 2?
A. 3
*B. 4
C. 5

Which are prime numbers?
A. 2
B. 3
C. 4
ANSWER: A,B`;

export function BankDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ search: '', difficulty: '', tag: '', page: 1 });
  const [editing, setEditing] = useState<QuestionDto | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  const bank = useQuery({ queryKey: ['bank', id], queryFn: () => get<BankDetail>(`/banks/${id}`) });
  const params = new URLSearchParams({ page: String(filters.page), pageSize: '20' });
  if (filters.search) params.set('search', filters.search);
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.tag) params.set('tag', filters.tag);
  const questions = useQuery({
    queryKey: ['bank', id, 'questions', params.toString()],
    queryFn: () => get<Paginated<QuestionDto>>(`/banks/${id}/questions?${params}`),
    placeholderData: keepPreviousData,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['bank', id] });
  const remove = useMutation({ mutationFn: (qid: string) => del(`/questions/${qid}`), onSuccess: refresh });

  if (bank.isLoading) return <Spinner />;
  if (bank.error) return <ErrorAlert error={bank.error} />;
  const b = bank.data!;
  const data = questions.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHead
        title={b.name}
        subtitle={
          <>
            <Link to="/teacher/banks">Question banks</Link> · {b.subject.code} — {b.subject.name}
          </>
        }
        actions={
          <>
            <button onClick={() => setImporting(true)}>Import</button>
            <button className="primary" onClick={() => setEditing('new')}>
              New question
            </button>
          </>
        }
      />
      <div className="card row">
        <input
          placeholder="Search question text…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
          style={{ maxWidth: 320 }}
        />
        <select value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value, page: 1 })} style={{ maxWidth: 160 }}>
          <option value="">Any difficulty</option>
          {[1, 2, 3, 4, 5].map((d) => (
            <option key={d} value={d}>
              Difficulty {d} ({b.difficulty.find((x) => x.difficulty === d)?.count ?? 0})
            </option>
          ))}
        </select>
        <select value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value, page: 1 })} style={{ maxWidth: 200 }}>
          <option value="">Any tag</option>
          {b.tags.map((t) => (
            <option key={t.tag} value={t.tag}>
              {t.tag} ({t.count})
            </option>
          ))}
        </select>
        <span className="spacer" />
        <span className="muted small">{data?.total ?? 0} questions</span>
      </div>

      <div className="card">
        <ErrorAlert error={questions.error ?? remove.error} />
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <Empty>No questions match.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Type</th>
                  <th>Diff.</th>
                  <th>Tags</th>
                  <th className="num">Marks</th>
                  <th>Ver.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((q) => (
                  <tr key={q.id}>
                    <td style={{ maxWidth: 420 }}>
                      <div>{q.content}</div>
                      <div className="small muted">
                        ✓ {q.options.filter((o) => o.isCorrect).map((o) => o.content).join(' · ')}
                      </div>
                    </td>
                    <td>
                      <span className="badge">{q.type}</span>
                    </td>
                    <td>{q.difficulty}</td>
                    <td className="small">{q.tags.join(', ')}</td>
                    <td className="num">{q.marks}</td>
                    <td>v{q.version}</td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <button className="sm" onClick={() => setEditing(q)}>
                          Edit
                        </button>
                        <button
                          className="sm danger"
                          onClick={() => confirm('Delete this question? Past attempts keep their copy.') && remove.mutate(q.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="row end mt">
            <button className="sm" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>
              ← Prev
            </button>
            <span className="small muted">
              Page {filters.page} / {pages}
            </span>
            <button className="sm" disabled={filters.page >= pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>
              Next →
            </button>
          </div>
        )}
      </div>

      {editing && (
        <QuestionEditor
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={async (input: QuestionInput) => {
            if (editing === 'new') await post(`/banks/${id}/questions`, input);
            else await put(`/questions/${editing.id}`, input);
            refresh();
          }}
        />
      )}
      {importing && <ImportDialog bankId={id} onClose={() => setImporting(false)} onDone={refresh} />}
    </>
  );
}

function ImportDialog({ bankId, onClose, onDone }: { bankId: string; onClose: () => void; onDone: () => void }) {
  const [format, setFormat] = useState<'text' | 'json' | 'csv'>('text');
  const [content, setContent] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await post<ImportResult>(`/banks/${bankId}/import`, { format, content, dryRun, skipDuplicates: true });
      setResult(r);
      if (!dryRun) onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Import questions" onClose={onClose} wide>
      <div className="stack">
        <div className="row">
          {(['text', 'json', 'csv'] as const).map((f) => (
            <label className="check" key={f}>
              <input type="radio" checked={format === f} onChange={() => setFormat(f)} /> {f.toUpperCase()}
            </label>
          ))}
          <span className="spacer" />
          <label className="btn sm">
            Load file…
            <input
              type="file"
              accept=".txt,.json,.csv"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setContent(await file.text());
                if (file.name.endsWith('.json')) setFormat('json');
                else if (file.name.endsWith('.csv')) setFormat('csv');
              }}
            />
          </label>
        </div>
        <p className="small muted">
          {format === 'text' && 'Blocks separated by a blank line. First line = question. Mark correct options with * or add "ANSWER: B".'}
          {format === 'json' && 'Array of { content, type?, difficulty?, tags?, marks?, explanation?, options: [{ content, isCorrect }] }.'}
          {format === 'csv' && 'Header: content,type,difficulty,tags,marks,negative_marks,explanation,A,B,C,D,correct (correct like "B" or "A;C").'}
        </p>
        <textarea
          rows={12}
          value={content}
          placeholder={format === 'text' ? SAMPLE_TEXT : ''}
          onChange={(e) => {
            setContent(e.target.value);
            setResult(null);
          }}
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}
        />
        <ErrorAlert error={error} />
        {result && (
          <div className={`alert ${result.errors.length ? 'warn' : 'success'}`}>
            {result.dryRun
              ? `Preview: ${result.wouldCreate} question(s) will be created.`
              : `Imported ${result.created} question(s).`}{' '}
            {result.duplicates.length > 0 && `${result.duplicates.length} duplicate(s) skipped. `}
            {result.errors.length > 0 && `${result.errors.length} item(s) have errors:`}
            {result.errors.length > 0 && (
              <ul className="small" style={{ margin: '6px 0 0' }}>
                {result.errors.slice(0, 20).map((e) => (
                  <li key={e.item}>
                    #{e.item}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="actions">
          <button onClick={onClose}>Close</button>
          <button disabled={!content || busy} onClick={() => run(true)}>
            Preview
          </button>
          <button className="primary" disabled={!content || busy || result?.dryRun === false} onClick={() => run(false)}>
            Import
          </button>
        </div>
      </div>
    </Modal>
  );
}

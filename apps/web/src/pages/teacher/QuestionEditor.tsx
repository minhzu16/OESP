import { FormEvent, useState } from 'react';
import type { QuestionDto, QuestionInput, QuestionType } from '@exam/shared';
import { ErrorAlert, Modal } from '../../components/ui';

const blank = (): QuestionInput => ({
  type: 'SINGLE',
  difficulty: 1,
  tags: [],
  content: '',
  explanation: '',
  marks: 1,
  negativeMarks: 0,
  options: [
    { content: '', isCorrect: true },
    { content: '', isCorrect: false },
    { content: '', isCorrect: false },
    { content: '', isCorrect: false },
  ],
});

export function QuestionEditor({
  initial,
  onSave,
  onClose,
}: {
  initial?: QuestionDto;
  onSave: (input: QuestionInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const [q, setQ] = useState<QuestionInput>(() =>
    initial
      ? {
          type: initial.type,
          difficulty: initial.difficulty,
          tags: initial.tags,
          content: initial.content,
          explanation: initial.explanation ?? '',
          marks: initial.marks,
          negativeMarks: initial.negativeMarks,
          options: initial.options.map((o) => ({ content: o.content, isCorrect: o.isCorrect })),
        }
      : blank(),
  );
  const [tags, setTags] = useState(q.tags.join(', '));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  function setType(type: QuestionType) {
    if (type === 'TRUE_FALSE') {
      setQ({ ...q, type, options: [{ content: 'True', isCorrect: true }, { content: 'False', isCorrect: false }] });
    } else if (type === 'SINGLE') {
      let seen = false;
      setQ({ ...q, type, options: q.options.map((o) => ({ ...o, isCorrect: o.isCorrect && !seen && (seen = true) })) });
    } else setQ({ ...q, type });
  }

  function toggleCorrect(i: number) {
    setQ({
      ...q,
      options: q.options.map((o, j) =>
        q.type === 'MULTIPLE' ? (j === i ? { ...o, isCorrect: !o.isCorrect } : o) : { ...o, isCorrect: j === i },
      ),
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({
        ...q,
        explanation: q.explanation || null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={initial ? `Edit question (v${initial.version})` : 'New question'} onClose={onClose} wide>
      <form className="stack" onSubmit={submit}>
        {initial && (
          <div className="alert info small">
            Changing the text, options or marks creates version {initial.version + 1}. Published exams keep using the version they froze.
          </div>
        )}
        <ErrorAlert error={error} />
        <div className="grid cols-4">
          <label className="field">
            Type
            <select value={q.type} onChange={(e) => setType(e.target.value as QuestionType)}>
              <option value="SINGLE">Single choice</option>
              <option value="MULTIPLE">Multiple choice</option>
              <option value="TRUE_FALSE">True / False</option>
            </select>
          </label>
          <label className="field">
            Difficulty (1–5)
            <input type="number" min={1} max={5} value={q.difficulty} onChange={(e) => setQ({ ...q, difficulty: Number(e.target.value) })} />
          </label>
          <label className="field">
            Marks
            <input type="number" min={0.01} step={0.01} value={q.marks} onChange={(e) => setQ({ ...q, marks: Number(e.target.value) })} />
          </label>
          <label className="field">
            Negative marks
            <input type="number" min={0} step={0.01} value={q.negativeMarks} onChange={(e) => setQ({ ...q, negativeMarks: Number(e.target.value) })} />
          </label>
        </div>
        <label className="field">
          Question
          <textarea required value={q.content} onChange={(e) => setQ({ ...q, content: e.target.value })} />
        </label>
        <div className="stack">
          <span className="small" style={{ fontWeight: 500 }}>
            Options <span className="muted">— mark the correct {q.type === 'MULTIPLE' ? 'answers' : 'answer'}</span>
          </span>
          {q.options.map((o, i) => (
            <div className="row" key={i}>
              <input
                type={q.type === 'MULTIPLE' ? 'checkbox' : 'radio'}
                name="correct"
                checked={o.isCorrect}
                onChange={() => toggleCorrect(i)}
                aria-label={`Option ${i + 1} correct`}
              />
              <input
                required
                value={o.content}
                disabled={q.type === 'TRUE_FALSE'}
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                onChange={(e) => setQ({ ...q, options: q.options.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)) })}
                style={{ flex: 1, width: 'auto' }}
              />
              {q.type !== 'TRUE_FALSE' && q.options.length > 2 && (
                <button type="button" className="ghost sm" onClick={() => setQ({ ...q, options: q.options.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              )}
            </div>
          ))}
          {q.type !== 'TRUE_FALSE' && q.options.length < 10 && (
            <div>
              <button type="button" className="sm" onClick={() => setQ({ ...q, options: [...q.options, { content: '', isCorrect: false }] })}>
                + Add option
              </button>
            </div>
          )}
        </div>
        <div className="grid cols-2">
          <label className="field">
            Tags <span className="hint">comma separated</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <label className="field">
            Explanation <span className="hint">shown after results are released</span>
            <input value={q.explanation ?? ''} onChange={(e) => setQ({ ...q, explanation: e.target.value })} />
          </label>
        </div>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

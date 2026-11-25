import { FormEvent, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { GradingMethod } from '@exam/shared';
import { patch } from '../../../api/client';
import { ErrorAlert } from '../../../components/ui';
import { fromLocalInput, toLocalInput } from '../../../lib/format';
import type { ExamDetail } from './examEditorTypes';

export function SettingsCard({ exam, onSaved }: { exam: ExamDetail; onSaved: () => void }) {
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

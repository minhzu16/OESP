import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { AttemptView, SaveAnswerResponse, SubmitResponse } from '@exam/shared';
import { api, ApiError, errorMessage, get, NetworkError, post } from '../../api/client';
import { ErrorAlert, Modal, Spinner } from '../../components/ui';
import { fmtDuration } from '../../lib/format';
import { queryClient } from '../../queryClient';
import { AutosaveQueue, QueueStatus, SendOutcome } from './autosaveQueue';
import { serverClock } from './serverClock';
import { useCountdown, useOnline } from './useCountdown';

const KEYS = 'ABCDEFGHIJ';

function loadFlags(attemptId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(`attempt:${attemptId}:flags`) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function AttemptPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<AttemptView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [selections, setSelections] = useState<Map<string, string[]>>(new Map());
  const [current, setCurrent] = useState(0);
  const [flags, setFlags] = useState<Set<string>>(() => loadFlags(id));
  const [status, setStatus] = useState<QueueStatus>('saved');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const queueRef = useRef<AutosaveQueue | null>(null);
  const online = useOnline();

  const goToResult = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['me'] });
    navigate(`/attempts/${id}/result`, { replace: true });
  }, [id, navigate]);

  // Load the attempt (resume) and wire the autosave queue.
  useEffect(() => {
    let cancelled = false;
    const sentAt = performance.now();
    get<AttemptView>(`/attempts/${id}`)
      .then((v) => {
        if (cancelled) return;
        serverClock.sample(v.serverTime, sentAt, performance.now());
        if (v.status !== 'IN_PROGRESS') {
          goToResult();
          return;
        }
        const transport = async (qvId: string, draft: { selectedOptionIds: string[]; seq: number }): Promise<SendOutcome> => {
          try {
            await api<SaveAnswerResponse>(`/attempts/${id}/answers/${qvId}`, { method: 'PUT', body: draft });
            return 'ok';
          } catch (err) {
            if (err instanceof NetworkError) return 'retry';
            if (err instanceof ApiError) {
              if (err.code === 'STALE_SEQ') return 'stale';
              if (err.code === 'ATTEMPT_EXPIRED' || err.code === 'ATTEMPT_NOT_IN_PROGRESS') return 'closed';
              if (err.status === 400 || err.status === 404) return 'reject';
            }
            return 'retry';
          }
        };
        const queue = new AutosaveQueue(id, transport);
        queueRef.current = queue;
        queue.subscribe((s) => {
          setStatus(s);
          if (s === 'closed') goToResult();
        });
        setSelections(queue.hydrate(v.answers));
        setView(v);
      })
      .catch((err) => !cancelled && setLoadError(err));
    return () => {
      cancelled = true;
      queueRef.current?.dispose();
      queueRef.current = null;
    };
  }, [id, goToResult]);

  useEffect(() => {
    if (online) queueRef.current?.nudge();
  }, [online]);

  // Warn before closing the tab while answers are still unsent (they are kept locally either way).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if ((queueRef.current?.pending ?? 0) > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const submit = useCallback(
    async (auto: boolean) => {
      if (submitting) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        await queueRef.current?.flushAndWait(auto ? 4000 : 8000);
        // Stable key per attempt: retries of this submit are replayed by the server, never re-run.
        await post<SubmitResponse>(`/attempts/${id}/submit`, {}, { 'Idempotency-Key': `submit:${id}` });
        queueRef.current?.close();
        goToResult();
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          goToResult();
          return;
        }
        setSubmitError(err);
        setSubmitting(false);
      }
    },
    [id, submitting, goToResult],
  );

  const remaining = useCountdown(view?.deadlineAt, () => void submit(true));

  const questions = view?.questions ?? [];
  const question = questions[current];
  const answeredCount = useMemo(
    () => questions.filter((q) => (selections.get(q.questionVersionId) ?? []).length > 0).length,
    [questions, selections],
  );

  const choose = useCallback(
    (optionId: string) => {
      if (!question || submitting) return;
      const prev = selections.get(question.questionVersionId) ?? [];
      const next =
        question.type === 'MULTIPLE'
          ? prev.includes(optionId)
            ? prev.filter((o) => o !== optionId)
            : [...prev, optionId]
          : [optionId];
      setSelections((m) => new Map(m).set(question.questionVersionId, next));
      queueRef.current?.set(question.questionVersionId, next);
    },
    [question, selections, submitting],
  );

  const clear = () => {
    if (!question) return;
    setSelections((m) => new Map(m).set(question.questionVersionId, []));
    queueRef.current?.set(question.questionVersionId, []);
  };

  const toggleFlag = () => {
    if (!question) return;
    const next = new Set(flags);
    if (next.has(question.questionVersionId)) next.delete(question.questionVersionId);
    else next.add(question.questionVersionId);
    setFlags(next);
    localStorage.setItem(`attempt:${id}:flags`, JSON.stringify([...next]));
  };

  // Keyboard: A–J / 1–9 choose, ←/→ navigate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'text') return;
      if (e.key === 'ArrowRight') setCurrent((c) => Math.min(questions.length - 1, c + 1));
      else if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(0, c - 1));
      else if (question) {
        const k = e.key.toUpperCase();
        const idx = /^[1-9]$/.test(k) ? Number(k) - 1 : KEYS.indexOf(k);
        if (idx >= 0 && idx < question.options.length) choose(question.options[idx].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, questions.length, choose, confirming]);

  if (loadError) {
    return (
      <main className="page">
        <ErrorAlert error={loadError} />
        <button className="mt" onClick={() => navigate('/student')}>
          Back to my exams
        </button>
      </main>
    );
  }
  if (!view || !question) return <Spinner />;

  const seconds = Math.ceil((remaining ?? 0) / 1000);
  const timerClass = seconds <= 60 ? 'timer danger' : seconds <= 300 ? 'timer warn' : 'timer';
  const selected = selections.get(question.questionVersionId) ?? [];
  const unanswered = questions.filter((q) => (selections.get(q.questionVersionId) ?? []).length === 0);

  return (
    <>
      <div className="exam-topbar">
        <div className="title">
          <span className="muted small" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500 }}>Examination</span>
          {view.examTitle}
        </div>
        <SaveIndicator status={status} online={online} />
        <div className={timerClass} aria-live="polite" title="Time remaining (server time)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{remaining === null ? '--:--' : fmtDuration(seconds)}</span>
        </div>
        <button className="primary" disabled={submitting} onClick={() => setConfirming(true)}>
          Submit attempt
        </button>
      </div>
      {(!online || status === 'retrying') && (
        <div className="offline-banner" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M1 1l22 22" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>Connection lost — answers are preserved locally on this device and will sync automatically.</span>
        </div>
      )}
      {submitting && !confirming && <div className="offline-banner">Submitting attempt to grading server…</div>}
      {submitError !== null && !confirming && (
        <div className="offline-banner">
          Submission failed: {errorMessage(submitError)}{' '}
          <button className="sm" onClick={() => void submit(true)}>
            Retry submit
          </button>
        </div>
      )}

      <div className="exam-shell">
        <section className="card" style={{ padding: '28px 30px' }}>
          <div className="row between" style={{ paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <div className="row" style={{ gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)' }}>
                Question {current + 1} of {questions.length}
              </span>
              <span className="badge">
                {question.marks} mark{question.marks === 1 ? '' : 's'}
              </span>
              {question.type === 'MULTIPLE' && (
                <span className="badge blue">Multiple choice (select all that apply)</span>
              )}
            </div>
            <button
              className={`sm ${flags.has(question.questionVersionId) ? 'primary' : 'ghost'}`}
              onClick={toggleFlag}
              style={{ gap: 6 }}
            >
              {flags.has(question.questionVersionId) ? '★ Flagged for review' : '☆ Flag question'}
            </button>
          </div>
          <div className="question-content mt" style={{ marginTop: 22 }}>{question.content}</div>
          <div role={question.type === 'MULTIPLE' ? 'group' : 'radiogroup'} style={{ marginTop: 20 }}>
            {question.options.map((o, i) => {
              const isSel = selected.includes(o.id);
              return (
                <label key={o.id} className={`option${isSel ? ' selected' : ''}`}>
                  <input
                    type={question.type === 'MULTIPLE' ? 'checkbox' : 'radio'}
                    name={question.questionVersionId}
                    checked={isSel}
                    onChange={() => choose(o.id)}
                    className="sr-only"
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                  />
                  <span className="key">{KEYS[i]}</span>
                  <span style={{ flex: 1, paddingTop: 3 }}>{o.content}</span>
                </label>
              );
            })}
          </div>
          <div className="row between mt" style={{ paddingTop: 18, borderTop: '1px solid var(--border)' }}>
            <button disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
              ← Previous
            </button>
            <button className="ghost sm" onClick={clear} disabled={selected.length === 0}>
              Clear selection
            </button>
            <button disabled={current === questions.length - 1} onClick={() => setCurrent((c) => c + 1)}>
              Next question →
            </button>
          </div>
          <p className="small muted mt" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
            Keyboard shortcuts: <kbd>A</kbd>–<kbd>{KEYS[question.options.length - 1]}</kbd> select · <kbd>←</kbd> <kbd>→</kbd> navigate questions
          </p>
        </section>

        <aside className="stack">
          <div className="card">
            <h3 style={{ fontSize: '0.98rem', marginBottom: 12 }}>Question Navigator</h3>
            <div className="palette">
              {questions.map((q, i) => {
                const answered = (selections.get(q.questionVersionId) ?? []).length > 0;
                const cls = [answered && 'answered', i === current && 'current', flags.has(q.questionVersionId) && 'flagged']
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button key={q.questionVersionId} className={cls} onClick={() => setCurrent(i)} aria-label={`Question ${i + 1}`}>
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="legend">
              <span className="row" style={{ gap: 5 }}>
                <span className="badge blue" style={{ width: 8, height: 8, padding: 0 }} />
                <span>Answered ({answeredCount}/{questions.length})</span>
              </span>
              <span className="row" style={{ gap: 5 }}>
                <span className="badge amber" style={{ width: 8, height: 8, padding: 0 }} />
                <span>Flagged ({flags.size})</span>
              </span>
            </div>
          </div>
          <div className="card small muted" style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text)' }}>Exam Integrity & Autosave:</strong>
            <p style={{ margin: '6px 0 0', fontSize: '0.82rem' }}>
              Attempt #{view.attemptNo}. Answers sync continuously with the official server clock. When the countdown reaches zero, your responses are securely submitted automatically.
            </p>
          </div>
        </aside>
      </div>

      {confirming && (
        <Modal title="Submit your exam?" onClose={() => !submitting && setConfirming(false)}>
          {unanswered.length > 0 ? (
            <div className="alert warn">
              {unanswered.length} question{unanswered.length > 1 ? 's are' : ' is'} unanswered:{' '}
              {unanswered.map((q) => q.position + 1).join(', ')}
            </div>
          ) : (
            <p>All {questions.length} questions are answered.</p>
          )}
          {flags.size > 0 && <p className="muted mt">{flags.size} question(s) are flagged for review.</p>}
          <p className="mt">You cannot change your answers after submitting.</p>
          {submitError !== null && <div className="alert error">{errorMessage(submitError)}</div>}
          <div className="actions">
            <button onClick={() => setConfirming(false)} disabled={submitting}>
              Keep working
            </button>
            <button className="primary" onClick={() => void submit(false)} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit now'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function SaveIndicator({ status, online }: { status: QueueStatus; online: boolean }) {
  const label = !online
    ? 'Offline — saved on this device'
    : status === 'saving'
      ? 'Saving…'
      : status === 'retrying'
        ? 'Retrying…'
        : status === 'closed'
          ? 'Closed'
          : 'All answers saved';
  return (
    <span className={`save-status ${online ? status : 'retrying'}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

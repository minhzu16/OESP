import { ReactNode, useEffect } from 'react';
import type { AttemptStatus, ExamPhase } from '@exam/shared';
import { errorMessage } from '../api/client';

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{errorMessage(error)}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <div style={{ opacity: 0.45, marginBottom: 8 }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
        </svg>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function PageHead({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button
            type="button"
            className="sm ghost"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ padding: '4px 8px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const PHASE_COLOR: Record<ExamPhase, string> = {
  DRAFT: '',
  SCHEDULED: 'amber',
  OPEN: 'green',
  CLOSED: '',
  ARCHIVED: '',
};

export function PhaseBadge({ phase }: { phase: ExamPhase }) {
  const formatted = phase.charAt(0) + phase.slice(1).toLowerCase();
  return <span className={`badge ${PHASE_COLOR[phase]}`}>{formatted}</span>;
}

const STATUS_COLOR: Record<AttemptStatus, string> = {
  IN_PROGRESS: 'blue',
  SUBMITTED: 'amber',
  EXPIRED: 'amber',
  GRADED: 'green',
  ABANDONED: 'red',
};

export function StatusBadge({ status }: { status: AttemptStatus }) {
  const formatted = status
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
  return <span className={`badge ${STATUS_COLOR[status]}`}>{formatted}</span>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

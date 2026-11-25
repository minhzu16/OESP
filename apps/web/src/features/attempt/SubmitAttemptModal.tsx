import type { AttemptQuestionView } from '@exam/shared';
import { errorMessage } from '../../api/client';
import { Modal } from '../../components/ui';

interface SubmitAttemptModalProps {
  totalQuestions: number;
  unanswered: AttemptQuestionView[];
  flaggedCount: number;
  submitting: boolean;
  submitError: unknown;
  onClose: () => void;
  onConfirm: () => void;
}

export function SubmitAttemptModal({
  totalQuestions,
  unanswered,
  flaggedCount,
  submitting,
  submitError,
  onClose,
  onConfirm,
}: SubmitAttemptModalProps) {
  return (
    <Modal title="Submit your exam?" onClose={() => !submitting && onClose()}>
      {unanswered.length > 0 ? (
        <div className="alert warn">
          {unanswered.length} question{unanswered.length > 1 ? 's are' : ' is'} unanswered:{' '}
          {unanswered.map((q) => q.position + 1).join(', ')}
        </div>
      ) : (
        <p>All {totalQuestions} questions are answered.</p>
      )}
      {flaggedCount > 0 && <p className="muted mt">{flaggedCount} question(s) are flagged for review.</p>}
      <p className="mt">You cannot change your answers after submitting.</p>
      {submitError !== null && <div className="alert error">{errorMessage(submitError)}</div>}
      <div className="actions">
        <button onClick={onClose} disabled={submitting}>
          Keep working
        </button>
        <button className="primary" onClick={onConfirm} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit now'}
        </button>
      </div>
    </Modal>
  );
}

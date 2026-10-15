export const Role = { ADMIN: 'ADMIN', TEACHER: 'TEACHER', STUDENT: 'STUDENT' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const QuestionType = { SINGLE: 'SINGLE', MULTIPLE: 'MULTIPLE', TRUE_FALSE: 'TRUE_FALSE' } as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

export const ExamStatus = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' } as const;
export type ExamStatus = (typeof ExamStatus)[keyof typeof ExamStatus];

/** Derived from the stored status and the DB clock — never stored. */
export const ExamPhase = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ExamPhase = (typeof ExamPhase)[keyof typeof ExamPhase];

export const GradingMethod = { HIGHEST: 'HIGHEST', LAST: 'LAST', FIRST: 'FIRST', AVERAGE: 'AVERAGE' } as const;
export type GradingMethod = (typeof GradingMethod)[keyof typeof GradingMethod];

export const AttemptStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  EXPIRED: 'EXPIRED',
  GRADED: 'GRADED',
  ABANDONED: 'ABANDONED',
} as const;
export type AttemptStatus = (typeof AttemptStatus)[keyof typeof AttemptStatus];

export const SubmitReason = {
  MANUAL: 'MANUAL',
  TIMEOUT: 'TIMEOUT',
  SWEEPER: 'SWEEPER',
  VIOLATION: 'VIOLATION',
  ADMIN: 'ADMIN',
} as const;
export type SubmitReason = (typeof SubmitReason)[keyof typeof SubmitReason];

import type {
  AttemptStatus,
  ExamPhase,
  ExamStatus,
  GradingMethod,
  QuestionType,
  Role,
  SubmitReason,
} from './enums.js';

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: UserDto;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OptionInput {
  content: string;
  isCorrect: boolean;
}

export interface QuestionInput {
  type: QuestionType;
  difficulty: number;
  tags: string[];
  content: string;
  explanation?: string | null;
  marks: number;
  negativeMarks: number;
  options: OptionInput[];
}

export interface QuestionDto {
  id: string;
  bankId: string;
  type: QuestionType;
  difficulty: number;
  tags: string[];
  isDeleted: boolean;
  version: number;
  versionId: string;
  content: string;
  explanation: string | null;
  marks: number;
  negativeMarks: number;
  options: { id: string; content: string; isCorrect: boolean; orderIndex: number }[];
  updatedAt: string;
}

export interface ExamDto {
  id: string;
  title: string;
  instructions: string | null;
  subjectId: string | null;
  durationSeconds: number;
  startAt: string;
  endAt: string;
  resultsReleaseAt: string | null;
  maxAttempts: number;
  gradingMethod: GradingMethod;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  partialCredit: boolean;
  passMark: number | null;
  status: ExamStatus;
  phase: ExamPhase;
  publishedAt: string | null;
  version: number;
  questionCount: number;
}

export interface StudentExamDto {
  id: string;
  title: string;
  instructions: string | null;
  durationSeconds: number;
  startAt: string;
  endAt: string;
  phase: ExamPhase;
  maxAttempts: number;
  attemptsUsed: number;
  attemptsLeft: number;
  activeAttemptId: string | null;
  resultsReleased: boolean;
  questionCount: number;
}

/** What a student sees while taking the exam: never contains correctness data. */
export interface AttemptQuestionView {
  position: number;
  questionVersionId: string;
  type: QuestionType;
  content: string;
  marks: number;
  options: { id: string; content: string }[];
}

export interface AttemptAnswerView {
  questionVersionId: string;
  selectedOptionIds: string[];
  seq: number;
  savedAt: string;
}

export interface AttemptView {
  id: string;
  examId: string;
  examTitle: string;
  attemptNo: number;
  status: AttemptStatus;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  submitReason: SubmitReason | null;
  questions: AttemptQuestionView[];
  answers: AttemptAnswerView[];
  serverTime: string;
}

export interface SaveAnswerResponse {
  questionVersionId: string;
  seq: number;
  savedAt: string;
  serverTime: string;
}

export interface SubmitResponse {
  attemptId: string;
  status: AttemptStatus;
  submittedAt: string | null;
  submitReason: SubmitReason | null;
  alreadySubmitted: boolean;
  serverTime: string;
}

export type QuestionOutcome = 'CORRECT' | 'PARTIAL' | 'WRONG' | 'BLANK';

export interface ResultBreakdownItem {
  position: number;
  questionVersionId: string;
  outcome: QuestionOutcome;
  awarded: number;
  marks: number;
}

export interface ResultReviewItem extends ResultBreakdownItem {
  type: QuestionType;
  content: string;
  explanation: string | null;
  options: { id: string; content: string; isCorrect: boolean }[];
  selectedOptionIds: string[];
}

export interface AttemptResultDto {
  attemptId: string;
  examId: string;
  examTitle: string;
  status: AttemptStatus;
  released: boolean;
  resultsReleaseAt: string | null;
  score?: number;
  maxScore?: number;
  percentage?: number;
  passed?: boolean | null;
  correctCount?: number;
  wrongCount?: number;
  blankCount?: number;
  gradedAt?: string;
  review?: ResultReviewItem[];
}

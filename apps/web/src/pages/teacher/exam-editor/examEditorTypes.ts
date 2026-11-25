import type { ExamDto } from '@exam/shared';

export interface ExamDetail extends ExamDto {
  assignmentCount: number;
  attemptCount: number;
  sections: {
    id: string;
    bankId: string;
    bankName: string;
    difficulty: number | null;
    tag: string | null;
    pickCount: number;
    frozenPoolSize: number | null;
  }[];
  fixedQuestions: {
    questionId: string;
    content: string;
    type: string;
    marks: number;
    isDeleted: boolean;
  }[];
}

export interface BankSummary {
  id: string;
  name: string;
  questionCount: number;
}

export interface Assignment {
  id: string;
  student: { id: string; email: string; fullName: string } | null;
  class: { id: string; name: string; _count: { members: number } } | null;
}

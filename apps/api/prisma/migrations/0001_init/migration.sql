-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE', 'MULTIPLE', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GradingMethod" AS ENUM ('HIGHEST', 'LAST', 'FIRST', 'AVERAGE');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'GRADED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SubmitReason" AS ENUM ('MANUAL', 'TIMEOUT', 'SWEEPER', 'VIOLATION', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_members" (
    "class_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "class_members_pkey" PRIMARY KEY ("class_id","user_id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_banks" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "question_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "bank_id" UUID NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" SMALLINT NOT NULL DEFAULT 1,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content_hash" TEXT NOT NULL,
    "current_version_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_versions" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "content" TEXT NOT NULL,
    "explanation" TEXT,
    "marks" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "negative_marks" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "question_version_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "subject_id" UUID,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "duration_seconds" INTEGER NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "results_release_at" TIMESTAMPTZ(3),
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "grading_method" "GradingMethod" NOT NULL DEFAULT 'HIGHEST',
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT true,
    "shuffle_options" BOOLEAN NOT NULL DEFAULT true,
    "partial_credit" BOOLEAN NOT NULL DEFAULT false,
    "pass_mark" DECIMAL(8,2),
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sections" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "bank_id" UUID NOT NULL,
    "difficulty" SMALLINT,
    "tag" TEXT,
    "pick_count" INTEGER NOT NULL,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "exam_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_pool_items" (
    "section_id" UUID NOT NULL,
    "question_version_id" UUID NOT NULL,

    CONSTRAINT "exam_pool_items_pkey" PRIMARY KEY ("section_id","question_version_id")
);

-- CreateTable
CREATE TABLE "exam_fixed_questions" (
    "exam_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "question_version_id" UUID,

    CONSTRAINT "exam_fixed_questions_pkey" PRIMARY KEY ("exam_id","question_id")
);

-- CreateTable
CREATE TABLE "exam_assignments" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "student_id" UUID,
    "class_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" TIMESTAMPTZ(3) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "submit_reason" "SubmitReason",
    "graded_at" TIMESTAMPTZ(3),
    "seed" INTEGER NOT NULL,
    "client_session_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_questions" (
    "attempt_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "question_version_id" UUID NOT NULL,
    "option_order" UUID[],

    CONSTRAINT "attempt_questions_pkey" PRIMARY KEY ("attempt_id","position")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "attempt_id" UUID NOT NULL,
    "question_version_id" UUID NOT NULL,
    "selected_option_ids" UUID[],
    "seq" INTEGER NOT NULL,
    "saved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("attempt_id","question_version_id")
);

-- CreateTable
CREATE TABLE "results" (
    "attempt_id" UUID NOT NULL,
    "score" DECIMAL(8,2) NOT NULL,
    "max_score" DECIMAL(8,2) NOT NULL,
    "correct_count" INTEGER NOT NULL,
    "wrong_count" INTEGER NOT NULL,
    "blank_count" INTEGER NOT NULL,
    "passed" BOOLEAN,
    "breakdown" JSONB NOT NULL,
    "graded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "checksum" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "results_pkey" PRIMARY KEY ("attempt_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "response_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "class_members_user_id_idx" ON "class_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE INDEX "question_banks_owner_id_idx" ON "question_banks"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_current_version_id_key" ON "questions"("current_version_id");

-- CreateIndex
CREATE INDEX "questions_bank_id_difficulty_idx" ON "questions"("bank_id", "difficulty");

-- CreateIndex
CREATE INDEX "questions_bank_id_content_hash_idx" ON "questions"("bank_id", "content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "question_versions_question_id_version_key" ON "question_versions"("question_id", "version");

-- CreateIndex
CREATE INDEX "question_options_question_version_id_idx" ON "question_options"("question_version_id");

-- CreateIndex
CREATE INDEX "exams_owner_id_idx" ON "exams"("owner_id");

-- CreateIndex
CREATE INDEX "exams_status_start_at_idx" ON "exams"("status", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "exam_assignments_exam_id_student_id_key" ON "exam_assignments"("exam_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_assignments_exam_id_class_id_key" ON "exam_assignments"("exam_id", "class_id");

-- CreateIndex
CREATE INDEX "attempts_status_deadline_at_idx" ON "attempts"("status", "deadline_at");

-- CreateIndex
CREATE INDEX "attempts_exam_id_student_id_idx" ON "attempts"("exam_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_exam_id_student_id_attempt_no_key" ON "attempts"("exam_id", "student_id", "attempt_no");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_questions_attempt_id_question_version_id_key" ON "attempt_questions"("attempt_id", "question_version_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_members" ADD CONSTRAINT "class_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "question_banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "question_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "question_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_pool_items" ADD CONSTRAINT "exam_pool_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "exam_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_pool_items" ADD CONSTRAINT "exam_pool_items_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_fixed_questions" ADD CONSTRAINT "exam_fixed_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_fixed_questions" ADD CONSTRAINT "exam_fixed_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_question_version_id_fkey" FOREIGN KEY ("question_version_id") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
-- Hand-written integrity guarantees (not expressible in schema.prisma)
-- ════════════════════════════════════════════════════════════════════════════

-- One active attempt per (exam, student). The application serialises starts with an
-- advisory lock; this index is the backstop that makes a second IN_PROGRESS row impossible.
CREATE UNIQUE INDEX "uq_one_active_attempt" ON "attempts" ("exam_id", "student_id") WHERE "status" = 'IN_PROGRESS';

-- Tag filtering for random-draw sections.
CREATE INDEX "questions_tags_gin" ON "questions" USING GIN ("tags");

-- Domain checks.
ALTER TABLE "exams" ADD CONSTRAINT "exams_window_chk" CHECK ("end_at" > "start_at");
ALTER TABLE "exams" ADD CONSTRAINT "exams_duration_chk" CHECK ("duration_seconds" > 0);
ALTER TABLE "exams" ADD CONSTRAINT "exams_max_attempts_chk" CHECK ("max_attempts" >= 1);
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_pick_chk" CHECK ("pick_count" > 0);
ALTER TABLE "exam_assignments" ADD CONSTRAINT "exam_assignments_target_chk"
  CHECK (("student_id" IS NOT NULL) <> ("class_id" IS NOT NULL));
ALTER TABLE "questions" ADD CONSTRAINT "questions_difficulty_chk" CHECK ("difficulty" BETWEEN 1 AND 5);
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_marks_chk"
  CHECK ("marks" > 0 AND "negative_marks" >= 0);
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_deadline_chk" CHECK ("deadline_at" > "started_at");
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_seq_chk" CHECK ("seq" >= 0);
ALTER TABLE "results" ADD CONSTRAINT "results_score_chk" CHECK ("score" >= 0 AND "score" <= "max_score");

-- Results can only change through the audited regrade path, which sets
-- `app.audit_reason` in the same transaction. Results can never be deleted.
CREATE OR REPLACE FUNCTION "guard_results_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'results are immutable: DELETE is not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(current_setting('app.audit_reason', true), '') = '' THEN
    RAISE EXCEPTION 'results can only be changed by an audited regrade (app.audit_reason not set)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."attempt_id" <> OLD."attempt_id" THEN
    RAISE EXCEPTION 'results.attempt_id is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "results_guard"
  BEFORE UPDATE OR DELETE ON "results"
  FOR EACH ROW EXECUTE FUNCTION "guard_results_change"();

-- Audit log is append-only.
CREATE OR REPLACE FUNCTION "guard_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "guard_append_only"();

-- Saved answers cannot be altered once the attempt is closed (defence in depth for submit/autosave races).
CREATE OR REPLACE FUNCTION "guard_answers_after_close"() RETURNS trigger AS $$
DECLARE s "AttemptStatus";
BEGIN
  SELECT "status" INTO s FROM "attempts" WHERE "id" = NEW."attempt_id";
  IF s IS DISTINCT FROM 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt % is closed; answers are frozen', NEW."attempt_id" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "attempt_answers_frozen"
  BEFORE INSERT OR UPDATE ON "attempt_answers"
  FOR EACH ROW EXECUTE FUNCTION "guard_answers_after_close"();

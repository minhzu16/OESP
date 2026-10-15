import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode, Paginated, QuestionDto, QuestionInput } from '@exam/shared';
import { AuthUser } from '../../common/auth.decorators';
import { AppException, notFound } from '../../common/errors';
import { assertOwnerOrAdmin, ownerScope } from '../../common/ownership';
import { pageArgs } from '../../common/pagination';
import { Db, PrismaService } from '../../prisma/prisma.service';
import { CreateBankDto, ImportDto, QuestionQuery, UpdateBankDto } from './question-bank.dto';
import { parseImport } from './import-parsers';
import { contentHash, normaliseTags, validateQuestionInput } from './question-input';

const questionInclude = {
  currentVersion: { include: { options: { orderBy: { orderIndex: 'asc' } } } },
} satisfies Prisma.QuestionInclude;

type QuestionWithVersion = Prisma.QuestionGetPayload<{ include: typeof questionInclude }>;

function toQuestionDto(q: QuestionWithVersion): QuestionDto {
  const v = q.currentVersion!;
  return {
    id: q.id,
    bankId: q.bankId,
    type: v.type,
    difficulty: q.difficulty,
    tags: q.tags,
    isDeleted: q.isDeleted,
    version: v.version,
    versionId: v.id,
    content: v.content,
    explanation: v.explanation,
    marks: Number(v.marks),
    negativeMarks: Number(v.negativeMarks),
    options: v.options.map((o) => ({
      id: o.id,
      content: o.content,
      isCorrect: o.isCorrect,
      orderIndex: o.orderIndex,
    })),
    updatedAt: q.updatedAt.toISOString(),
  };
}

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Banks ──

  async listBanks(user: AuthUser) {
    const banks = await this.prisma.questionBank.findMany({
      where: ownerScope(user),
      orderBy: { updatedAt: 'desc' },
      include: {
        subject: true,
        _count: { select: { questions: { where: { isDeleted: false } } } },
      },
    });
    return banks.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      subject: { id: b.subject.id, code: b.subject.code, name: b.subject.name },
      questionCount: b._count.questions,
      updatedAt: b.updatedAt,
    }));
  }

  async getBank(id: string, user: AuthUser) {
    const bank = await this.prisma.questionBank.findUnique({ where: { id }, include: { subject: true } });
    if (!bank) throw notFound('Question bank');
    assertOwnerOrAdmin(bank.ownerId, user, 'Question bank');
    const tags = await this.prisma.$queryRaw<{ tag: string; count: bigint }[]>`
      SELECT unnest(tags) AS tag, count(*) AS count FROM questions
       WHERE bank_id = ${id}::uuid AND NOT is_deleted GROUP BY 1 ORDER BY 2 DESC LIMIT 100`;
    const byDifficulty = await this.prisma.question.groupBy({
      by: ['difficulty'],
      where: { bankId: id, isDeleted: false },
      _count: true,
    });
    return {
      ...bank,
      tags: tags.map((t) => ({ tag: t.tag, count: Number(t.count) })),
      difficulty: byDifficulty.map((d) => ({ difficulty: d.difficulty, count: d._count })),
    };
  }

  async createBank(dto: CreateBankDto, user: AuthUser) {
    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject) throw notFound('Subject');
    return this.prisma.questionBank.create({
      data: { subjectId: dto.subjectId, ownerId: user.id, name: dto.name.trim(), description: dto.description },
    });
  }

  async updateBank(id: string, dto: UpdateBankDto, user: AuthUser) {
    await this.getBank(id, user);
    return this.prisma.questionBank.update({ where: { id }, data: dto });
  }

  async deleteBank(id: string, user: AuthUser) {
    await this.getBank(id, user);
    const used = await this.prisma.examSection.count({ where: { bankId: id } });
    const attempted = await this.prisma.attemptQuestion.count({
      where: { questionVersion: { question: { bankId: id } } },
    });
    if (used > 0 || attempted > 0) {
      throw new AppException(
        ErrorCode.CONFLICT,
        'Bank is used by exams or attempts; delete its questions instead',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.question.updateMany({ where: { bankId: id }, data: { currentVersionId: null } });
      await tx.questionBank.delete({ where: { id } });
    });
  }

  // ── Questions ──

  async listQuestions(bankId: string, q: QuestionQuery, user: AuthUser): Promise<Paginated<QuestionDto>> {
    await this.getBank(bankId, user);
    const where: Prisma.QuestionWhereInput = {
      bankId,
      isDeleted: q.includeDeleted ? undefined : false,
      difficulty: q.difficulty,
      tags: q.tag ? { has: q.tag.toLowerCase() } : undefined,
      currentVersion: q.search ? { content: { contains: q.search, mode: 'insensitive' } } : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        include: questionInclude,
        orderBy: { createdAt: 'asc' },
        ...pageArgs(q),
      }),
      this.prisma.question.count({ where }),
    ]);
    return { items: items.map(toQuestionDto), total, page: q.page, pageSize: q.pageSize };
  }

  async getQuestion(id: string, user: AuthUser) {
    const q = await this.prisma.question.findUnique({
      where: { id },
      include: { ...questionInclude, bank: true, versions: { select: { id: true, version: true, createdAt: true } } },
    });
    if (!q) throw notFound('Question');
    assertOwnerOrAdmin(q.bank.ownerId, user, 'Question');
    return {
      ...toQuestionDto(q),
      versions: q.versions.sort((a, b) => b.version - a.version),
    };
  }

  async createQuestion(bankId: string, input: QuestionInput, user: AuthUser): Promise<QuestionDto> {
    await this.getBank(bankId, user);
    this.assertValid(input);
    const id = await this.prisma.$transaction((tx) => this.insertQuestion(tx, bankId, input, user.id));
    return this.getQuestion(id, user);
  }

  /**
   * Content changes (text, options, marks, type) create a new immutable version; difficulty
   * and tags are bank metadata and are updated in place. Published exams and past attempts
   * keep pointing to the version they froze.
   */
  async updateQuestion(id: string, input: QuestionInput, user: AuthUser): Promise<QuestionDto> {
    const existing = await this.getQuestion(id, user);
    if (existing.isDeleted) throw notFound('Question');
    this.assertValid(input);
    const normalised = this.normalise(input);

    const contentChanged =
      existing.type !== normalised.type ||
      existing.content !== normalised.content ||
      (existing.explanation ?? null) !== (normalised.explanation ?? null) ||
      existing.marks !== normalised.marks ||
      existing.negativeMarks !== normalised.negativeMarks ||
      JSON.stringify(existing.options.map((o) => [o.content, o.isCorrect])) !==
        JSON.stringify(normalised.options.map((o) => [o.content, o.isCorrect]));

    await this.prisma.$transaction(async (tx) => {
      let currentVersionId = existing.versionId;
      if (contentChanged) {
        const v = await this.insertVersion(tx, id, existing.version + 1, normalised, user.id);
        currentVersionId = v.id;
      }
      await tx.question.update({
        where: { id },
        data: {
          type: normalised.type,
          difficulty: normalised.difficulty,
          tags: normalised.tags,
          contentHash: contentHash(normalised),
          currentVersionId,
        },
      });
    });
    return this.getQuestion(id, user);
  }

  async deleteQuestion(id: string, user: AuthUser): Promise<void> {
    await this.getQuestion(id, user);
    // Soft delete: historical attempts and frozen exam pools still reference its versions.
    await this.prisma.question.update({ where: { id }, data: { isDeleted: true } });
  }

  async restoreQuestion(id: string, user: AuthUser): Promise<QuestionDto> {
    await this.getQuestion(id, user);
    await this.prisma.question.update({ where: { id }, data: { isDeleted: false } });
    return this.getQuestion(id, user);
  }

  async importQuestions(bankId: string, dto: ImportDto, user: AuthUser) {
    await this.getBank(bankId, user);
    const parsed = parseImport(dto.format, dto.content);
    const existingHashes = new Set(
      (
        await this.prisma.question.findMany({
          where: { bankId, isDeleted: false },
          select: { contentHash: true },
        })
      ).map((q) => q.contentHash),
    );

    const toCreate: QuestionInput[] = [];
    const duplicates: { item: number; content: string }[] = [];
    for (const { item, input } of parsed.questions) {
      const hash = contentHash(this.normalise(input));
      if (existingHashes.has(hash)) {
        duplicates.push({ item, content: input.content.slice(0, 120) });
        if (dto.skipDuplicates !== false) continue;
      }
      existingHashes.add(hash);
      toCreate.push(input);
    }

    if (!dto.dryRun && toCreate.length > 0) {
      await this.prisma.$transaction(
        async (tx) => {
          for (const input of toCreate) await this.insertQuestion(tx, bankId, input, user.id);
        },
        { timeout: 60_000 },
      );
    }
    return {
      dryRun: !!dto.dryRun,
      parsed: parsed.questions.length,
      created: dto.dryRun ? 0 : toCreate.length,
      wouldCreate: toCreate.length,
      duplicates,
      errors: parsed.errors,
    };
  }

  /** Groups of questions in a bank whose normalised content and options are identical. */
  async findDuplicates(bankId: string, user: AuthUser) {
    await this.getBank(bankId, user);
    const groups = await this.prisma.question.groupBy({
      by: ['contentHash'],
      where: { bankId, isDeleted: false },
      _count: { _all: true },
      having: { contentHash: { _count: { gt: 1 } } },
    });
    const result = [];
    for (const g of groups) {
      const qs = await this.prisma.question.findMany({
        where: { bankId, isDeleted: false, contentHash: g.contentHash },
        include: questionInclude,
      });
      result.push(qs.map(toQuestionDto));
    }
    return result;
  }

  // ── internals ──

  private assertValid(input: QuestionInput): void {
    const errors = validateQuestionInput(this.normalise(input));
    if (errors.length) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Invalid question', HttpStatus.BAD_REQUEST, errors);
    }
  }

  private normalise(input: QuestionInput): QuestionInput {
    return {
      ...input,
      content: input.content.trim(),
      explanation: input.explanation?.trim() || null,
      tags: normaliseTags(input.tags),
      options: input.options.map((o) => ({ content: o.content.trim(), isCorrect: o.isCorrect })),
    };
  }

  private async insertQuestion(tx: Db, bankId: string, raw: QuestionInput, actorId: string): Promise<string> {
    const input = this.normalise(raw);
    const question = await tx.question.create({
      data: {
        bankId,
        type: input.type,
        difficulty: input.difficulty,
        tags: input.tags,
        contentHash: contentHash(input),
      },
    });
    const version = await this.insertVersion(tx, question.id, 1, input, actorId);
    await tx.question.update({ where: { id: question.id }, data: { currentVersionId: version.id } });
    return question.id;
  }

  private insertVersion(tx: Db, questionId: string, version: number, input: QuestionInput, actorId: string) {
    return tx.questionVersion.create({
      data: {
        questionId,
        version,
        type: input.type,
        content: input.content,
        explanation: input.explanation ?? null,
        marks: input.marks,
        negativeMarks: input.negativeMarks,
        createdById: actorId,
        options: {
          create: input.options.map((o, i) => ({ content: o.content, isCorrect: o.isCorrect, orderIndex: i })),
        },
      },
    });
  }
}

import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode, Paginated, UserDto } from '@exam/shared';
import { AuthUser } from '../../common/auth.decorators';
import { AppException, notFound } from '../../common/errors';
import { assertOwnerOrAdmin, ownerScope } from '../../common/ownership';
import { pageArgs } from '../../common/pagination';
import { isUniqueViolation, PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../core/audit.service';
import { hashPassword } from '../auth/password';
import { toUserDto } from '../auth/auth.service';
import { CreateUserDto, SubjectDto, UpdateUserDto, UserQuery } from './directory.dto';

@Injectable()
export class DirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Users ──

  async listUsers(q: UserQuery): Promise<Paginated<UserDto>> {
    const where: Prisma.UserWhereInput = {
      role: q.role,
      ...(q.search
        ? {
            OR: [
              { email: { contains: q.search, mode: 'insensitive' } },
              { fullName: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.user.count({ where }),
    ]);
    return { items: items.map(toUserDto), total, page: q.page, pageSize: q.pageSize };
  }

  async createUser(dto: CreateUserDto, actor: AuthUser): Promise<UserDto> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          fullName: dto.fullName.trim(),
          role: dto.role,
          passwordHash: await hashPassword(dto.password),
        },
      });
      await this.audit.log({
        entityType: 'user',
        entityId: user.id,
        actorId: actor.id,
        action: 'USER_CREATED',
        newValue: { email: user.email, role: user.role },
      });
      return toUserDto(user);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppException(ErrorCode.EMAIL_TAKEN, 'Email is already registered', HttpStatus.CONFLICT);
      }
      throw err;
    }
  }

  async updateUser(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<UserDto> {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw notFound('User');
    if (id === actor.id && (dto.role !== undefined || dto.isActive === false)) {
      throw new AppException(ErrorCode.FORBIDDEN, 'You cannot demote or disable yourself', HttpStatus.FORBIDDEN);
    }
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: dto });
      if (dto.isActive === false) {
        await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.log(
        {
          entityType: 'user',
          entityId: id,
          actorId: actor.id,
          action: 'USER_UPDATED',
          oldValue: { role: before.role, isActive: before.isActive, fullName: before.fullName },
          newValue: dto,
        },
        tx,
      );
      return updated;
    });
    return toUserDto(user);
  }

  // ── Classes ──

  listClasses(user: AuthUser) {
    return this.prisma.class.findMany({
      where: ownerScope(user),
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { members: true } } },
    });
  }

  createClass(name: string, user: AuthUser) {
    return this.prisma.class.create({ data: { name: name.trim(), ownerId: user.id } });
  }

  async getClass(id: string, user: AuthUser) {
    const cls = await this.prisma.class.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, fullName: true, role: true } } },
        },
      },
    });
    if (!cls) throw notFound('Class');
    assertOwnerOrAdmin(cls.ownerId, user, 'Class');
    return {
      id: cls.id,
      name: cls.name,
      createdAt: cls.createdAt,
      members: cls.members.map((m) => m.user).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    };
  }

  async addMembers(classId: string, emails: string[], user: AuthUser) {
    await this.getClass(classId, user);
    const unique = [...new Set(emails)];
    const students = await this.prisma.user.findMany({
      where: { email: { in: unique }, role: 'STUDENT', isActive: true },
      select: { id: true, email: true },
    });
    await this.prisma.classMember.createMany({
      data: students.map((s) => ({ classId, userId: s.id })),
      skipDuplicates: true,
    });
    const found = new Set(students.map((s) => s.email));
    return { added: students.length, notFound: unique.filter((e) => !found.has(e)) };
  }

  async removeMember(classId: string, userId: string, user: AuthUser) {
    await this.getClass(classId, user);
    await this.prisma.classMember.deleteMany({ where: { classId, userId } });
  }

  async deleteClass(id: string, user: AuthUser) {
    await this.getClass(id, user);
    await this.prisma.class.delete({ where: { id } });
  }

  // ── Subjects ──

  listSubjects() {
    return this.prisma.subject.findMany({ orderBy: { code: 'asc' } });
  }

  async createSubject(dto: SubjectDto) {
    try {
      return await this.prisma.subject.create({ data: { code: dto.code.toUpperCase(), name: dto.name.trim() } });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppException(ErrorCode.CONFLICT, 'Subject code already exists', HttpStatus.CONFLICT);
      }
      throw err;
    }
  }

  async updateSubject(id: string, dto: SubjectDto) {
    return this.prisma.subject.update({
      where: { id },
      data: { code: dto.code.toUpperCase(), name: dto.name.trim() },
    });
  }
}

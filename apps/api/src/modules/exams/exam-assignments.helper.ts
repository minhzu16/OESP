import { AuthUser } from '../../common/auth.decorators';
import { notFound } from '../../common/errors';
import { ownerScope } from '../../common/ownership';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignDto } from './exams.dto';

export async function listExamAssignments(prisma: PrismaService, examId: string) {
  return prisma.examAssignment.findMany({
    where: { examId },
    orderBy: { createdAt: 'asc' },
    include: {
      student: { select: { id: true, email: true, fullName: true } },
      class: { select: { id: true, name: true, _count: { select: { members: true } } } },
    },
  });
}

export async function assignExamTargets(
  prisma: PrismaService,
  examId: string,
  dto: AssignDto,
  user: AuthUser,
) {
  const studentIds = [...new Set(dto.studentIds ?? [])];
  const classIds = [...new Set(dto.classIds ?? [])];
  const students = await prisma.user.count({ where: { id: { in: studentIds }, role: 'STUDENT' } });
  if (students !== studentIds.length) throw notFound('Student');
  const classes = await prisma.class.count({ where: { id: { in: classIds }, ...ownerScope(user) } });
  if (classes !== classIds.length) throw notFound('Class');
  await prisma.examAssignment.createMany({
    data: [
      ...studentIds.map((studentId) => ({ examId, studentId })),
      ...classIds.map((classId) => ({ examId, classId })),
    ],
    skipDuplicates: true,
  });
  return listExamAssignments(prisma, examId);
}

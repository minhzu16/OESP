import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db, PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  entityType: 'result' | 'attempt' | 'exam' | 'user';
  entityId: string;
  actorId: string | null;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

/** Writes to the append-only `audit_logs` table (UPDATE/DELETE are blocked by a DB trigger). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorId: entry.actorId,
        action: entry.action,
        oldValue: toJson(entry.oldValue),
        newValue: toJson(entry.newValue),
        reason: entry.reason ?? null,
      },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

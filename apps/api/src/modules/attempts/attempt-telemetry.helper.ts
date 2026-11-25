import { Logger } from '@nestjs/common';
import { ErrorCode, ProctoringEventType, ProctoringSeverity, TelemetryResponse } from '@exam/shared';
import { AuthUser } from '../../common/auth.decorators';
import { conflict, notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { RecordTelemetryDto } from './attempts.dto';

const PROCTORING_RISK_WEIGHTS: Readonly<Record<ProctoringEventType, number>> = {
  TAB_SWITCH: 15,
  WINDOW_BLUR: 10,
  COPY_PASTE_ATTEMPT: 25,
  FULLSCREEN_EXIT: 20,
};

function resolveProctoringSeverity(score: number): ProctoringSeverity {
  if (score >= 80) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

/**
 * Records anti-cheating proctoring telemetry event (tab switch, window blur, copy/paste attempt, fullscreen exit).
 * Aggregates cumulative risk score and persists to the append-only audit trail.
 */
export async function recordAttemptTelemetry(
  prisma: PrismaService,
  logger: Logger,
  attemptId: string,
  dto: RecordTelemetryDto,
  user: AuthUser,
): Promise<TelemetryResponse> {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, studentId: user.id },
  });
  if (!attempt) throw notFound('Attempt');
  if (attempt.status !== 'IN_PROGRESS') {
    throw conflict(ErrorCode.ATTEMPT_NOT_IN_PROGRESS, 'Attempt is no longer in progress', { status: attempt.status });
  }

  const eventScore = PROCTORING_RISK_WEIGHTS[dto.eventType] ?? 10;

  const pastEvents = await prisma.auditLog.findMany({
    where: {
      entityType: 'ATTEMPT_PROCTORING',
      entityId: attemptId,
    },
    select: { newValue: true },
  });

  const previousRiskTotal = pastEvents.reduce((acc, ev) => {
    const score = Number((ev.newValue as Record<string, unknown> | null)?.eventScore);
    return Number.isFinite(score) ? acc + score : acc;
  }, 0);

  const cumulativeRiskScore = previousRiskTotal + eventScore;
  const totalEventsCount = pastEvents.length + 1;
  const severity = resolveProctoringSeverity(cumulativeRiskScore);
  const recordedAt = new Date().toISOString();

  await prisma.auditLog.create({
    data: {
      entityType: 'ATTEMPT_PROCTORING',
      entityId: attemptId,
      actorId: user.id,
      action: dto.eventType,
      newValue: {
        eventScore,
        cumulativeRiskScore,
        severity,
        details: dto.details ?? null,
        clientTimestamp: dto.clientTimestamp ?? null,
        recordedAt,
      },
      reason: `Proctoring violation event: ${dto.eventType}`,
    },
  });

  logger.warn(
    `Proctoring telemetry recorded for attempt ${attemptId}: event=${dto.eventType}, score=+${eventScore}, cumulativeScore=${cumulativeRiskScore}, severity=${severity}`,
  );

  return {
    attemptId,
    eventType: dto.eventType,
    eventScore,
    totalEventsCount,
    cumulativeRiskScore,
    severity,
    recordedAt,
  };
}

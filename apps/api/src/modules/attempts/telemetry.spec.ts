import { AttemptsService } from './attempts.service';
import { ProctoringEventType } from '@exam/shared';
import { AuthUser } from '../../common/auth.decorators';

describe('AttemptsService - Proctoring Telemetry & Anti-Cheating Audit Trail', () => {
  let service: AttemptsService;
  let prismaMock: any;
  let gradingMock: any;
  let expiryMock: any;

  const mockUser: AuthUser = {
    id: '11111111-1111-1111-1111-111111111111',
    role: 'STUDENT',
  };

  const attemptId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    prismaMock = {
      attempt: {
        findFirst: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };
    gradingMock = {};
    expiryMock = {};

    service = new AttemptsService(prismaMock, gradingMock, expiryMock);
  });

  it('records a TAB_SWITCH event, calculates initial risk score and LOW severity', async () => {
    prismaMock.attempt.findFirst.mockResolvedValue({
      id: attemptId,
      studentId: mockUser.id,
      status: 'IN_PROGRESS',
    });

    prismaMock.auditLog.findMany.mockResolvedValue([]);
    prismaMock.auditLog.create.mockResolvedValue({ id: 1n });

    const result = await service.recordTelemetry(
      attemptId,
      { eventType: ProctoringEventType.TAB_SWITCH, details: 'Alt-tabbed to browser search' },
      mockUser,
    );

    expect(result.attemptId).toBe(attemptId);
    expect(result.eventType).toBe(ProctoringEventType.TAB_SWITCH);
    expect(result.eventScore).toBe(15);
    expect(result.totalEventsCount).toBe(1);
    expect(result.cumulativeRiskScore).toBe(15);
    expect(result.severity).toBe('LOW');
    expect(result.recordedAt).toBeDefined();

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'ATTEMPT_PROCTORING',
        entityId: attemptId,
        actorId: mockUser.id,
        action: ProctoringEventType.TAB_SWITCH,
        newValue: expect.objectContaining({
          eventScore: 15,
          cumulativeRiskScore: 15,
          severity: 'LOW',
          details: 'Alt-tabbed to browser search',
        }),
      }),
    });
  });

  it('aggregates past events and escalates severity from MEDIUM to CRITICAL', async () => {
    prismaMock.attempt.findFirst.mockResolvedValue({
      id: attemptId,
      studentId: mockUser.id,
      status: 'IN_PROGRESS',
    });

    // Past events had 60 points total
    prismaMock.auditLog.findMany.mockResolvedValue([
      { newValue: { eventScore: 15 } },
      { newValue: { eventScore: 20 } },
      { newValue: { eventScore: 25 } },
    ]);
    prismaMock.auditLog.create.mockResolvedValue({ id: 2n });

    // Now adding COPY_PASTE_ATTEMPT (+25 points) -> total becomes 85 -> CRITICAL
    const result = await service.recordTelemetry(
      attemptId,
      { eventType: ProctoringEventType.COPY_PASTE_ATTEMPT, details: 'Pasted 120 characters into answer box' },
      mockUser,
    );

    expect(result.eventType).toBe(ProctoringEventType.COPY_PASTE_ATTEMPT);
    expect(result.eventScore).toBe(25);
    expect(result.totalEventsCount).toBe(4);
    expect(result.cumulativeRiskScore).toBe(85);
    expect(result.severity).toBe('CRITICAL');
  });

  it('throws 404 notFound when attempt is missing or belongs to another student', async () => {
    prismaMock.attempt.findFirst.mockResolvedValue(null);

    await expect(
      service.recordTelemetry(attemptId, { eventType: ProctoringEventType.WINDOW_BLUR }, mockUser),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('throws 409 conflict when attempt is not in progress', async () => {
    prismaMock.attempt.findFirst.mockResolvedValue({
      id: attemptId,
      studentId: mockUser.id,
      status: 'SUBMITTED',
    });

    await expect(
      service.recordTelemetry(attemptId, { eventType: ProctoringEventType.WINDOW_BLUR }, mockUser),
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});

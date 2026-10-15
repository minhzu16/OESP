import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { getConfig } from './config/config';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { PrismaModule } from './prisma/prisma.service';
import { AttemptsModule } from './modules/attempts/attempts.module';
import { AuthModule } from './modules/auth/auth.module';
import { CoreModule } from './modules/core/core.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { ExamsModule } from './modules/exams/exams.module';
import { HealthModule } from './modules/health/health.controller';
import { QuestionBankModule } from './modules/question-bank/question-bank.module';
import { ResultsModule } from './modules/results/results.module';

export function loggerModule() {
  const cfg = getConfig();
  return LoggerModule.forRoot({
    pinoHttp: {
      level: cfg.logLevel,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      autoLogging: { ignore: (req) => req.url === '/api/health' || req.url === '/api/metrics' },
      transport: cfg.isProduction || cfg.logLevel === 'silent' ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
    },
  });
}

@Module({
  imports: [
    loggerModule(),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: () => getConfig().throttleLimitPerMinute }],
      // Key by authenticated user when available so a classroom behind one NAT is not throttled as one client.
      getTracker: (req: Record<string, any>) => req.user?.id ?? req.ip,
    }),
    PrismaModule,
    CoreModule,
    AuthModule,
    DirectoryModule,
    QuestionBankModule,
    ExamsModule,
    AttemptsModule,
    ResultsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { getConfig } from './config/config';

/** Shared HTTP setup for main.ts and the integration tests. */
export function configureApp(app: INestApplication): void {
  const cfg = getConfig();
  // Routes are /api/v1/...; version-neutral controllers (health, metrics) are /api/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(helmet());
  app.use(cookieParser());
  app.use((_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
    // Lets clients estimate clock offset from any response, not just attempt endpoints.
    res.setHeader('X-Server-Time', new Date().toISOString());
    next();
  });
  app.enableCors({
    origin: cfg.corsOrigins,
    credentials: true,
    exposedHeaders: ['X-Server-Time', 'X-Request-Id', 'Idempotent-Replayed'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, // rejects unexpected fields such as `role` or `score`
      transform: true,
    }),
  );
  (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set('trust proxy', 1);
}

export function setupSwagger(app: INestApplication): void {
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Online Examination API')
      .setDescription('Question banks, exams, attempts, automatic grading and result reports')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, doc);
}

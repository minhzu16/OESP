import 'reflect-metadata';
import { loadDotEnv } from './config/config';
loadDotEnv();
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { getConfig } from './config/config';
import { configureApp, setupSwagger } from './setup';

async function bootstrap() {
  const cfg = getConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  setupSwagger(app);
  app.enableShutdownHooks();
  await app.listen(cfg.port, '0.0.0.0');
}

void bootstrap();

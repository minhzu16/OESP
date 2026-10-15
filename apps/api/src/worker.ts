import 'reflect-metadata';
import { loadDotEnv } from './config/config';
loadDotEnv();
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loggerModule } from './app.module';
import { PrismaModule } from './prisma/prisma.service';
import { CoreModule } from './modules/core/core.module';
import { MaintenanceRunner } from './worker/maintenance.runner';

@Module({
  imports: [loggerModule(), PrismaModule, CoreModule],
  providers: [MaintenanceRunner],
})
class WorkerModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

void bootstrap();

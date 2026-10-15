import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { ReportsService } from './reports.service';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';

@Module({
  imports: [ExamsModule],
  controllers: [ResultsController],
  providers: [ResultsService, ReportsService],
})
export class ResultsModule {}

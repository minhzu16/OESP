import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AttemptResultDto } from '@exam/shared';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { AuditQuery, ExamFilterQuery, ExtendDeadlineDto, RegradeDto, ResultsQuery } from './results.dto';
import { ReportsService } from './reports.service';
import { ResultsService } from './results.service';

@ApiTags('results')
@ApiBearerAuth()
@Controller()
export class ResultsController {
  constructor(
    private readonly results: ResultsService,
    private readonly reports: ReportsService,
  ) {}

  @Roles('STUDENT')
  @Get('attempts/:id/result')
  studentResult(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<AttemptResultDto> {
    return this.results.studentResult(id, user);
  }

  @Roles('TEACHER', 'ADMIN')
  @Get('attempts/:id/review')
  teacherAttempt(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.results.teacherAttempt(id, user);
  }

  @Roles('TEACHER', 'ADMIN')
  @Post('attempts/:id/regrade')
  regrade(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RegradeDto, @CurrentUser() user: AuthUser) {
    return this.results.regrade(id, dto, user);
  }

  @Roles('TEACHER', 'ADMIN')
  @Post('attempts/:id/extend')
  extend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExtendDeadlineDto, @CurrentUser() user: AuthUser) {
    return this.results.extendDeadline(id, dto, user);
  }

  @Roles('TEACHER', 'ADMIN')
  @Get('exams/:id/results')
  async gradebook(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ResultsQuery,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.format === 'csv') {
      const csv = await this.reports.gradebookCsv(id, user, q.view ?? 'students');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="exam-${id}-${q.view ?? 'students'}.csv"`);
      return csv;
    }
    return this.reports.gradebook(id, user);
  }

  @Roles('TEACHER', 'ADMIN')
  @Get('exams/:id/reports/summary')
  summary(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reports.summary(id, user);
  }

  @Roles('TEACHER', 'ADMIN')
  @Get('exams/:id/reports/items')
  items(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reports.items(id, user);
  }

  @Roles('TEACHER', 'ADMIN')
  @Get('integrity/results')
  @Header('Cache-Control', 'no-store')
  verify(@Query() q: ExamFilterQuery, @CurrentUser() user: AuthUser) {
    return this.results.verifyIntegrity(q.examId, user);
  }

  @Roles('ADMIN')
  @Get('admin/audit-logs')
  audit(@Query() q: AuditQuery) {
    return this.results.auditLogs(q);
  }
}

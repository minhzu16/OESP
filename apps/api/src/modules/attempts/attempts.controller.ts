import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AttemptView, SaveAnswerResponse, StudentExamDto, SubmitResponse } from '@exam/shared';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor';
import { SaveAnswerDto, StartAttemptDto } from './attempts.dto';
import { AttemptsService } from './attempts.service';

@ApiTags('attempts')
@ApiBearerAuth()
@Roles('STUDENT')
@Controller()
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Get('me/exams')
  myExams(@CurrentUser() user: AuthUser): Promise<StudentExamDto[]> {
    return this.attempts.myExams(user);
  }

  @Get('me/attempts')
  myAttempts(@CurrentUser() user: AuthUser) {
    return this.attempts.myAttempts(user);
  }

  /** 201 when a new attempt was created, 200 when an in-progress attempt was resumed. */
  @Post('exams/:examId/attempts')
  async start(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Body() dto: StartAttemptDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AttemptView> {
    const { view, created } = await this.attempts.start(examId, user, dto.clientSessionId);
    res.status(created ? 201 : 200);
    return view;
  }

  @Get('attempts/:id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<AttemptView> {
    return this.attempts.getView(id, user);
  }

  // Autosave is chatty by design; keep a per-user ceiling against abuse (~10 req/s).
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Put('attempts/:id/answers/:questionVersionId')
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionVersionId', ParseUUIDPipe) questionVersionId: string,
    @Body() dto: SaveAnswerDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SaveAnswerResponse> {
    return this.attempts.saveAnswer(id, questionVersionId, dto.selectedOptionIds, dto.seq, user);
  }

  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(200)
  @Post('attempts/:id/submit')
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser): Promise<SubmitResponse> {
    return this.attempts.submit(id, user);
  }
}

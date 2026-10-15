import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { AssignDto, CreateExamDto, SetFixedQuestionsDto, SetSectionsDto, UpdateExamDto } from './exams.dto';
import { ExamsService } from './exams.service';

@ApiTags('exams')
@ApiBearerAuth()
@Roles('TEACHER', 'ADMIN')
@Controller('exams')
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.exams.list(user);
  }

  @Post()
  create(@Body() dto: CreateExamDto, @CurrentUser() user: AuthUser) {
    return this.exams.create(dto, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exams.get(id, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExamDto, @CurrentUser() user: AuthUser) {
    return this.exams.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exams.remove(id, user);
  }

  @Put(':id/sections')
  sections(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetSectionsDto, @CurrentUser() user: AuthUser) {
    return this.exams.setSections(id, dto.sections, user);
  }

  @Put(':id/fixed-questions')
  fixed(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetFixedQuestionsDto, @CurrentUser() user: AuthUser) {
    return this.exams.setFixedQuestions(id, dto.questionIds, user);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exams.publish(id, user);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exams.archive(id, user);
  }

  @Post(':id/release-results')
  @HttpCode(200)
  release(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exams.releaseResults(id, user);
  }

  @Get(':id/assignments')
  assignments(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.exams.listAssignments(id, user);
  }

  @Post(':id/assignments')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDto, @CurrentUser() user: AuthUser) {
    return this.exams.assign(id, dto, user);
  }

  @Delete(':id/assignments/:assignmentId')
  @HttpCode(204)
  unassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.exams.unassign(id, assignmentId, user);
  }
}

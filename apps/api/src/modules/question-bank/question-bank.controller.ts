import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { CreateBankDto, ImportDto, QuestionDto, QuestionQuery, UpdateBankDto } from './question-bank.dto';
import { QuestionBankService } from './question-bank.service';

@ApiTags('question-bank')
@ApiBearerAuth()
@Roles('TEACHER', 'ADMIN')
@Controller('banks')
export class BanksController {
  constructor(private readonly banks: QuestionBankService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.banks.listBanks(user);
  }

  @Post()
  create(@Body() dto: CreateBankDto, @CurrentUser() user: AuthUser) {
    return this.banks.createBank(dto, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banks.getBank(id, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBankDto, @CurrentUser() user: AuthUser) {
    return this.banks.updateBank(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banks.deleteBank(id, user);
  }

  @Get(':id/questions')
  questions(@Param('id', ParseUUIDPipe) id: string, @Query() q: QuestionQuery, @CurrentUser() user: AuthUser) {
    return this.banks.listQuestions(id, q, user);
  }

  @Post(':id/questions')
  createQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuestionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.banks.createQuestion(id, dto, user);
  }

  @Post(':id/import')
  @HttpCode(200)
  import(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ImportDto, @CurrentUser() user: AuthUser) {
    return this.banks.importQuestions(id, dto, user);
  }

  @Get(':id/duplicates')
  duplicates(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banks.findDuplicates(id, user);
  }
}

@ApiTags('question-bank')
@ApiBearerAuth()
@Roles('TEACHER', 'ADMIN')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly banks: QuestionBankService) {}

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banks.getQuestion(id, user);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QuestionDto, @CurrentUser() user: AuthUser) {
    return this.banks.updateQuestion(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banks.deleteQuestion(id, user);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.banks.restoreQuestion(id, user);
  }
}

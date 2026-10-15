import { Module } from '@nestjs/common';
import { BanksController, QuestionsController } from './question-bank.controller';
import { QuestionBankService } from './question-bank.service';

@Module({
  controllers: [BanksController, QuestionsController],
  providers: [QuestionBankService],
  exports: [QuestionBankService],
})
export class QuestionBankModule {}

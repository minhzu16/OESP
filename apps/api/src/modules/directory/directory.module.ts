import { Module } from '@nestjs/common';
import {
  AdminUsersController,
  ClassesController,
  StudentsController,
  SubjectsController,
} from './directory.controller';
import { DirectoryService } from './directory.service';

@Module({
  controllers: [AdminUsersController, StudentsController, ClassesController, SubjectsController],
  providers: [DirectoryService],
})
export class DirectoryModule {}

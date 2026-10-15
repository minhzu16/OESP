import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/auth.decorators';
import { AddMembersDto, CreateClassDto, CreateUserDto, SubjectDto, UpdateUserDto, UserQuery } from './directory.dto';
import { DirectoryService } from './directory.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly directory: DirectoryService) {}

  @Get()
  list(@Query() q: UserQuery) {
    return this.directory.listUsers(q);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.directory.createUser(dto, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.directory.updateUser(id, dto, user);
  }
}

@ApiTags('directory')
@ApiBearerAuth()
@Roles('TEACHER', 'ADMIN')
@Controller('students')
export class StudentsController {
  constructor(private readonly directory: DirectoryService) {}

  /** Student lookup for teachers assigning exams. */
  @Get()
  search(@Query() q: UserQuery) {
    return this.directory.listUsers({ ...q, role: 'STUDENT' });
  }
}

@ApiTags('classes')
@ApiBearerAuth()
@Roles('TEACHER', 'ADMIN')
@Controller('classes')
export class ClassesController {
  constructor(private readonly directory: DirectoryService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.directory.listClasses(user);
  }

  @Post()
  create(@Body() dto: CreateClassDto, @CurrentUser() user: AuthUser) {
    return this.directory.createClass(dto.name, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.directory.getClass(id, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.directory.deleteClass(id, user);
  }

  @Post(':id/members')
  addMembers(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMembersDto, @CurrentUser() user: AuthUser) {
    return this.directory.addMembers(id, dto.emails, user);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.directory.removeMember(id, userId, user);
  }
}

@ApiTags('subjects')
@ApiBearerAuth()
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly directory: DirectoryService) {}

  @Get()
  list() {
    return this.directory.listSubjects();
  }

  @Roles('TEACHER', 'ADMIN')
  @Post()
  create(@Body() dto: SubjectDto) {
    return this.directory.createSubject(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SubjectDto) {
    return this.directory.updateSubject(id, dto);
  }
}

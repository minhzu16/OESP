import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PageQuery } from '../../common/pagination';

const ROLES = ['ADMIN', 'TEACHER', 'STUDENT'] as const;

export class CreateUserDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsIn(ROLES)
  role: (typeof ROLES)[number];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UserQuery extends PageQuery {
  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CreateClassDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}

export class AddMembersDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v)) : value,
  )
  @IsEmail({}, { each: true })
  emails: string[];
}

export class MemberParam {
  @IsUUID()
  userId: string;
}

export class SubjectDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,32}$/)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;
}

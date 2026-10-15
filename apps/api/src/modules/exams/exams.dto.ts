import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateExamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  instructions?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsInt()
  @Min(60)
  @Max(24 * 3600)
  durationSeconds: number;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  resultsReleaseAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxAttempts?: number;

  @IsOptional()
  @IsIn(['HIGHEST', 'LAST', 'FIRST', 'AVERAGE'])
  gradingMethod?: 'HIGHEST' | 'LAST' | 'FIRST' | 'AVERAGE';

  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;

  @IsOptional()
  @IsBoolean()
  partialCredit?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  passMark?: number | null;
}

export class UpdateExamDto {
  /** Optimistic concurrency: reject the update if someone else changed the exam meanwhile. */
  @IsOptional()
  @IsInt()
  version?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  instructions?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(24 * 3600)
  durationSeconds?: number;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  resultsReleaseAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxAttempts?: number;

  @IsOptional()
  @IsIn(['HIGHEST', 'LAST', 'FIRST', 'AVERAGE'])
  gradingMethod?: 'HIGHEST' | 'LAST' | 'FIRST' | 'AVERAGE';

  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;

  @IsOptional()
  @IsBoolean()
  partialCredit?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  passMark?: number | null;
}

export class SectionDto {
  @IsUUID()
  bankId: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(50)
  tag?: string | null;

  @IsInt()
  @Min(1)
  @Max(500)
  pickCount: number;
}

export class SetSectionsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SectionDto)
  sections: SectionDto[];
}

export class SetFixedQuestionsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  questionIds: string[];
}

export class AssignDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  studentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  classIds?: string[];
}

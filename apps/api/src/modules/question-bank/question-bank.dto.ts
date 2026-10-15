import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateBankDto {
  @IsUUID()
  subjectId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateBankDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class OptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  @IsBoolean()
  isCorrect: boolean;
}

export class QuestionDto {
  @IsIn(['SINGLE', 'MULTIPLE', 'TRUE_FALSE'])
  type: 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE';

  @IsInt()
  @Min(1)
  @Max(5)
  difficulty: number;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  explanation?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  marks: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  negativeMarks: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options: OptionDto[];
}

export class QuestionQuery extends PageQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tag?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeDeleted?: boolean;
}

export class ImportDto {
  @IsIn(['json', 'csv', 'text'])
  format: 'json' | 'csv' | 'text';

  @IsString()
  @MinLength(1)
  @MaxLength(5_000_000)
  content: string;

  /** When true (default), questions identical to an existing one in the bank are skipped. */
  @IsOptional()
  @IsBoolean()
  skipDuplicates?: boolean = true;

  /** Parse and validate only — nothing is written. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;
}

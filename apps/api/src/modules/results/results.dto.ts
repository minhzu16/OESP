import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class RegradeDto {
  /**
   * RECOMPUTE: re-run the scoring engine on the saved answers (e.g. after a scoring fix).
   * OVERRIDE: set the score manually (e.g. an appeal outcome).
   */
  @IsIn(['RECOMPUTE', 'OVERRIDE'])
  mode: 'RECOMPUTE' | 'OVERRIDE';

  @ValidateIf((o) => o.mode === 'OVERRIDE')
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  score?: number;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;

  /** The result version the teacher was looking at (optimistic locking). */
  @IsInt()
  @Min(0)
  expectedVersion: number;
}

export class ExtendDeadlineDto {
  @IsInt()
  @Min(1)
  @Max(24 * 3600)
  extraSeconds: number;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class AuditQuery extends PageQuery {
  @IsOptional()
  @IsIn(['result', 'attempt', 'exam', 'user'])
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;
}

export class ExamFilterQuery {
  @IsOptional()
  @IsUUID()
  examId?: string;
}

export class ResultsQuery {
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';

  @IsOptional()
  @Type(() => String)
  @IsIn(['attempts', 'students'])
  view?: 'attempts' | 'students';
}

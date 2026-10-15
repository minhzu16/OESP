import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class StartAttemptDto {
  /** Identifies the browser tab/device that started the attempt (informational). */
  @IsOptional()
  @IsUUID()
  clientSessionId?: string;
}

export class SaveAnswerDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  selectedOptionIds: string[];

  /** Monotonic client sequence number; the server only applies a newer seq than it has. */
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  seq: number;
}

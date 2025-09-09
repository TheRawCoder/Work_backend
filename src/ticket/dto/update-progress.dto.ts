// src/tickets/dto/update-progress.dto.ts
import { IsNumber, Min, Max, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProgressDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  progress: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  by?: string;
}

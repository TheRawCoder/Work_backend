import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSampleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  count?: number = 20;
}

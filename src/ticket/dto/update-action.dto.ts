import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class UpdateActionDto {
  @IsNotEmpty()
  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  by?: string; // optional audit field
}

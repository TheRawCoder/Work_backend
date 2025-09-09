import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddRemarkDto {
  @IsNotEmpty()
  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  by?: string;
}

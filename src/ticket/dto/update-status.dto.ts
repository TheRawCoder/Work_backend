import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateStatusDto {
  @IsIn(['open', 'in_progress', 'resolved', 'closed'])
  status: 'open' | 'in_progress' | 'resolved' | 'closed';

  @IsOptional()
  @IsString()
  by?: string;
}

// upload/dto/create-upload.dto.ts
import { IsOptional, IsString } from 'class-validator';

/**
 * This DTO is kept minimal since uploads come via multipart file.
 * It can hold optional metadata if you want (e.g., source, uploaderId, tags).
 */
export class CreateUploadDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  uploadedBy?: string;
}

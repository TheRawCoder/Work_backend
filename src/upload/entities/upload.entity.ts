// upload/entities/upload.entity.ts
import { Document } from 'mongoose';

/**
 * This file documents the shape of the stored document.
 * The actual Mongoose schema is in upload/schema/upload-data.schema.ts
 */
export interface UploadDocument extends Document {
  payload: Record<string, any>;
  category?: string;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

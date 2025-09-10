// upload/schema/upload-data.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UploadDataDocument = UploadData & Document;

@Schema({ timestamps: true })
export class UploadData {
  @Prop({ type: Object, required: true })
  payload: Record<string, any>;

  @Prop({ index: true, sparse: true })
  category?: string;

  @Prop({ index: true, sparse: true })
  status?: string;

  // createdAt will be provided by timestamps option
  @Prop({ index: true, sparse: true })
  createdAt?: Date;
}

export const UploadDataSchema = SchemaFactory.createForClass(UploadData);

// Useful compound indexes - tailor to your common queries
UploadDataSchema.index({ category: 1, status: 1 });
UploadDataSchema.index({ createdAt: 1 });
UploadDataSchema.index({ 'payload.ticketRefId': 1 });

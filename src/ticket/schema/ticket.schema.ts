import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TicketDocument = Ticket & Document;

@Schema({ timestamps: { createdAt: 'createdDate', updatedAt: 'updatedDate' } })
export class Ticket {
  @Prop({ required: true, unique: true })
  serialNumber: number;

  @Prop({ required: true, unique: true })
  ticketRefId: string; // e.g. "TKT-0001"

  @Prop({ required: true })
  category: string;

  @Prop({ default: '' })
  subCategory: string;

  @Prop({ default: '' })
  description: string;

  @Prop({
    default: 'open',
    enum: ['open', 'in_progress', 'resolved', 'closed'],
  })
  status: string;

  @Prop({
    type: [
      {
        by: { type: String },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  remarks: { by?: string; text: string; createdAt?: Date }[];

  @Prop({ default: '' })
  action: string;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

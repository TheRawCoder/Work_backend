import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Ticket, TicketSchema } from './schema/ticket.schema';
import { Counter, CounterSchema } from './schema/counter.schema';
import { TicketService } from './ticket.service'; // <-- fixed import
import { TicketController } from './ticket.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
  ],
  providers: [TicketService], // <-- use TicketService
  controllers: [TicketController],
  exports: [TicketService],
})
export class TicketModule {}

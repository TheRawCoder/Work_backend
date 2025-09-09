// backend/src/ticket/ticket.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  Patch,
  Delete,
  UsePipes,
  ValidationPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateSampleDto } from './dto/create-sample.dto';
import { AddRemarkDto } from './dto/add-remark.dto';
import { UpdateActionDto } from './dto/update-action.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('tickets')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TicketController {
  constructor(private readonly ticketService: TicketService) { }

  @Post()
  async create(@Body() dto: CreateTicketDto) {
    const ticket = await this.ticketService.create(dto);
    return { success: true, ticket };
  }

  @Post('sample')
  async createSample(@Body() dto: CreateSampleDto) {
    const inserted = await this.ticketService.createSample(dto);
    return {
      success: true,
      createdCount: inserted.length,
      sampleIds: inserted.map((i) => i._id),
    };
  }

  /**
   * List tickets with optional filters:
   * - limit, skip (pagination)
   * - status (raw backend status e.g. 'open', 'in_progress', 'resolved', 'closed')
   * - refId (ticketRefId, e.g. 'TKT-0001') - case-insensitive match
   * - startDate / endDate (ISO strings) to filter createdDate range
   */
  @Get()
  async list(
    @Query('limit') limit = '50',
    @Query('skip') skip = '0',
    @Query('status') status?: string,
    @Query('refId') refId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const l = parseInt(limit as string, 10) || 50;
    const s = parseInt(skip as string, 10) || 0;

    const filter: any = {};

    if (status) {
      filter.status = status;
    }

    if (refId) {
      // case-insensitive exact match on ticketRefId
      filter.ticketRefId = { $regex: `^${refId}$`, $options: 'i' };
    }

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        const sd = new Date(startDate);
        if (!isNaN(sd.getTime())) dateFilter.$gte = sd;
      }
      if (endDate) {
        const ed = new Date(endDate);
        if (!isNaN(ed.getTime())) dateFilter.$lte = ed;
      }
      if (Object.keys(dateFilter).length) {
        // assume stored field is createdDate; adjust if you use createdAt
        filter.createdDate = dateFilter;
      }
    }

    return this.ticketService.findAll(filter, l, s);
  }

  // Keep 'stats' before the ':id' param route so it won't be matched as an id.
  @Get('stats')
  async stats() {
    return this.ticketService.getStats();
  }

  // Generic single-ticket retrieval (by ticketRefId or Mongo _id or serial number handled inside service)
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.ticketService.findById(id);
  }

  @Post(':id/remarks')
  async addRemark(@Param('id') id: string, @Body() dto: AddRemarkDto) {
    return this.ticketService.addRemark(id, dto);
  }

  @Patch(':id/action')
  async updateAction(@Param('id') id: string, @Body() dto: UpdateActionDto) {
    return this.ticketService.updateAction(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.ticketService.updateStatus(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.ticketService.delete(id);
  }
}

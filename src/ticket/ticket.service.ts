/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { Model } from 'mongoose';
import { Ticket, TicketDocument } from './schema/ticket.schema';
import { Counter, CounterDocument } from './schema/counter.schema';
import { CreateSampleDto } from './dto/create-sample.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AddRemarkDto } from './dto/add-remark.dto';
import { UpdateActionDto } from './dto/update-action.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Injectable()
export class TicketService {
  constructor(
    @InjectModel(Ticket.name, 'dashboard-data') private ticketModel: Model<TicketDocument>,
    @InjectModel(Counter.name, 'dashboard-data') private counterModel: Model<CounterDocument>,
  ) { }

  private async getNextSequence(key = 'ticket'): Promise<number> {
    const updated = await this.counterModel
      .findOneAndUpdate(
        { key },
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
      )
      .exec();
    return updated.seq;
  }

  private formatTicketRef(seq: number): string {
    return `TKT-${seq.toString().padStart(4, '0')}`;
  }

  async create(createDto: CreateTicketDto) {
    const seq = await this.getNextSequence('ticket');
    const ticketRefId = this.formatTicketRef(seq);

    const created = new this.ticketModel({
      serialNumber: seq,
      ticketRefId,
      category: createDto.category,
      subCategory: createDto.subCategory || '',
      description: createDto.description || '',
      status: 'open',
      remarks: [],
      action: createDto.action || '',
    });

    return created.save();
  }

  async createSample(dto: CreateSampleDto) {
    const count = dto.count ?? 20;
    if (count <= 0) throw new BadRequestException('count must be > 0');

    const createdDocs: Partial<TicketDocument>[] = [];

    for (let i = 0; i < count; i++) {
      const seq = await this.getNextSequence('ticket');
      const ticketRefId = this.formatTicketRef(seq);
      const doc: Partial<TicketDocument> = {
        serialNumber: seq,
        ticketRefId,
        category: `Sample Category ${(i % 5) + 1}`,
        subCategory: `Sample Sub ${(i % 3) + 1}`,
        description: `Auto-generated sample ticket #${i + 1}`,
        status: 'open',
        remarks: [],
        action: 'No action',
      };
      createdDocs.push(doc);
    }

    const inserted = await this.ticketModel.insertMany(createdDocs);
    return inserted;
  }

  // allow sort to be any to avoid strict mongoose TS mismatch
  async findAll(
    filter: any = {},
    limit = 50,
    skip = 0,
    sort: any = { createdDate: -1 },
  ) {
    const items = await this.ticketModel
      .find(filter)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .exec();
    const total = await this.ticketModel.countDocuments(filter).exec();
    return { total, items };
  }

  // ---------- REPLACED: robust findById (tolerant lookups + debug logs) ----------
  async findById(idOrRef: string) {
    try {
      if (!idOrRef || typeof idOrRef !== 'string') {
        throw new NotFoundException('Ticket not found');
      }

      const incoming = idOrRef.trim();
      // Helpful debug logging (remove or lower level later if noisy)
      console.debug(`TicketService.findById called with: "${incoming}"`);

      // 1) Exact ticketRefId (e.g. "TKT-0001")
      const byRefExact = await this.ticketModel
        .findOne({ ticketRefId: incoming })
        .exec();
      if (byRefExact) {
        console.debug('findById -> matched by ticketRefId (exact)');
        return byRefExact;
      }

      // 2) Case-insensitive ticketRefId (covers casing differences)
      const byRefCi = await this.ticketModel
        .findOne({
          ticketRefId: { $regex: `^${incoming}$`, $options: 'i' },
        })
        .exec();
      if (byRefCi) {
        console.debug('findById -> matched by ticketRefId (case-insensitive)');
        return byRefCi;
      }

      // 3) If looks like an ObjectId, try findById
      if (mongoose.Types.ObjectId.isValid(incoming)) {
        const byId = await this.ticketModel.findById(incoming).exec();
        if (byId) {
          console.debug('findById -> matched by ObjectId');
          return byId;
        }
      }

      // 4) If incoming is numeric only, try serialNumber
      if (/^\d+$/.test(incoming)) {
        const bySerial = await this.ticketModel
          .findOne({ serialNumber: Number(incoming) })
          .exec();
        if (bySerial) {
          console.debug('findById -> matched by serialNumber');
          return bySerial;
        }
      }

      // 5) Try alternate ticketRefId forms (add/remove TKT- prefix)
      const altCandidate = incoming.startsWith('TKT-')
        ? incoming.replace(/^TKT-/i, '')
        : `TKT-${incoming}`;
      const altMatch = await this.ticketModel
        .findOne({
          $or: [
            { ticketRefId: altCandidate },
            { ticketRefId: { $regex: `^${altCandidate}$`, $options: 'i' } },
          ],
        })
        .exec();
      if (altMatch) {
        console.debug('findById -> matched by alternate ticketRefId form');
        return altMatch;
      }

      // nothing matched
      throw new NotFoundException('Ticket not found');
    } catch (err) {
      // preserve logging behavior and rethrow
      console.error('TicketService.findById error:', err);
      throw err;
    }
  }
  // ---------------------------------------------------------------------------

  async addRemark(idOrRef: string, dto: AddRemarkDto) {
    const ticket = await this.findById(idOrRef);
    const remark = {
      text: dto.text,
      by: dto.by || 'system',
      createdAt: new Date(),
    };
    ticket.remarks.push(remark);
    await ticket.save();
    return ticket;
  }

  async updateAction(idOrRef: string, dto: UpdateActionDto) {
    const ticket = await this.findById(idOrRef);
    ticket.action = dto.action;
    ticket.remarks.push({
      text: `Action updated: ${dto.action}`,
      by: dto.by || 'system',
      createdAt: new Date(),
    });
    await ticket.save();
    return ticket;
  }

  async updateStatus(idOrRef: string, dto: UpdateStatusDto) {
    const ticket = await this.findById(idOrRef);
    ticket.status = dto.status;
    ticket.remarks.push({
      text: `Status changed to ${dto.status}`,
      by: dto.by || 'system',
      createdAt: new Date(),
    });
    await ticket.save();
    return ticket;
  }

  async delete(idOrRef: string) {
    const ticket = await this.findById(idOrRef);
    await this.ticketModel.deleteOne({ _id: ticket._id }).exec();
    return { deleted: true };
  }

  async getStats() {
    // Aggregate counts by raw status
    const agg = await this.ticketModel
      .aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    // Convert to object map
    const rawCounts: Record<string, number> = {};
    for (const row of agg) {
      rawCounts[row._id ?? 'unknown'] = row.count;
    }

    // Map backend statuses to frontend labels
    const mapped = {
      Processing: rawCounts['in_progress'] ?? 0,
      Raised: rawCounts['open'] ?? 0,
      Resolved: rawCounts['resolved'] ?? 0,
      Rejected: rawCounts['closed'] ?? 0,
    };

    return mapped;
  }
}

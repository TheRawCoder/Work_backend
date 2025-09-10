/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/prefer-promise-reject-errors,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unused-vars */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { parse as csvParse, format as csvFormat } from 'fast-csv';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { UploadData, UploadDataDocument } from './schema/upload-data.schema';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  // tune this for your environment; larger batches reduce DB round-trips but use more memory
  private readonly BATCH_SIZE = Number(process.env.BATCH_SIZE || 5000);

  constructor(
    @InjectModel(UploadData.name)
    private readonly uploadModel: Model<UploadDataDocument>,
  ) { }

  /**
   * Top-level file parser entry
   */
  async parseAndStore(
    filePath: string,
    originalName?: string,
  ): Promise<{ insertedCount: number; message?: string }> {
    const ext = path.extname(originalName || filePath).toLowerCase();
    let inserted = 0;
    try {
      if (ext === '.csv') {
        inserted = await this._processCsv(filePath);
      } else if (ext === '.xls' || ext === '.xlsx') {
        inserted = await this._processXlsx(filePath);
      } else {
        throw new Error('Unsupported file type');
      }

      // remove uploaded file asynchronously
      fs.unlink(filePath, (err) => {
        if (err) this.logger.warn('Could not delete uploaded file: ' + err.message);
      });

      return { insertedCount: inserted, message: 'Imported successfully' };
    } catch (err) {
      this.logger.error(err);
      // on failure try to delete
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        /* ignore */
      }
      throw err;
    }
  }

  /**
   * Map an incoming CSV/XLSX row to the UploadData document shape.
   * Normalizes ticketRefId into payload.ticketRefId if possible and extracts category/status/createdAt.
   */
  private _mapRowToDocument(row: Record<string, any>) {
    // Ticket Ref variants
    const ticketRefRaw =
      row['Ticket Ref ID'] ||
      row['ticketRefId'] ||
      row['ticket_ref_id'] ||
      row['ticket_refid'] ||
      row['TicketRefId'] ||
      row['ticketRef'] ||
      null;

    const ticketRef =
      typeof ticketRefRaw === 'string' && ticketRefRaw.trim() !== ''
        ? ticketRefRaw.trim()
        : undefined;

    const doc: any = {
      payload: { ...row },
      category:
        row['category'] || row['Category'] || row['category_name'] || row['Category Name'] || null,
      status: row['status'] || row['Status'] || null,
    };

    if (ticketRef) {
      // keep original casing for payload but ensure key exists
      doc.payload.ticketRefId = ticketRef;
    }

    const createdVal =
      row['createdAt'] || row['created_at'] || row['Created Date'] || row['created'] || row['CreatedAt'] || null;
    if (createdVal) {
      const d = new Date(createdVal);
      if (!isNaN(d.getTime())) doc.createdAt = d;
    }

    return doc;
  }

  /**
   * Flush a batch of docs to DB *efficiently* avoiding inserting duplicates by ticketRefId.
   *
   * Strategy:
   * 1. Separate docs with ticketRefId and without.
   * 2. For docs with ticketRefId, query DB once to get existing ticketRefId set for this batch.
   * 3. Insert only those docs that don't exist (insertMany).
   * 4. For docs without ticketRefId, do a plain insertMany (they cannot be deduped by ticketRefId).
   *
   * Returns number of newly inserted docs.
   */
  private async _flushBatch(batch: any[]): Promise<number> {
    if (!batch || !batch.length) return 0;

    const withRef = batch.filter((d) => d?.payload?.ticketRefId);
    const withoutRef = batch.filter((d) => !d?.payload?.ticketRefId);

    let inserted = 0;

    // 1) For docs that have ticketRefId -> find which refs already exist
    if (withRef.length) {
      try {
        const refs = Array.from(new Set(withRef.map((d) => d.payload.ticketRefId)));
        // find existing docs for these refs
        const existing = await this.uploadModel
          .find({ 'payload.ticketRefId': { $in: refs } }, { 'payload.ticketRefId': 1 })
          .lean();

        const existingSet = new Set(existing.map((e) => e.payload?.ticketRefId).filter(Boolean));
        // filter to only new docs
        const toInsert = withRef.filter((d) => !existingSet.has(d.payload.ticketRefId));

        if (toInsert.length) {
          // insert in one shot
          const res = await this.uploadModel.insertMany(toInsert, { ordered: false });
          inserted += Array.isArray(res) ? res.length : 0;
        }
      } catch (e: any) {
        // log more info for debugging
        this.logger.warn('Error flushing batch (withRef): ' + (e && e.message ? e.message : JSON.stringify(e)));
        // If the error contains partial inserts, try to count them
        if (e && Array.isArray(e.insertedDocs)) {
          inserted += e.insertedDocs.length;
        }
      }
    }

    // 2) For docs without ticketRefId -> insert directly
    if (withoutRef.length) {
      try {
        const res = await this.uploadModel.insertMany(withoutRef, { ordered: false });
        inserted += Array.isArray(res) ? res.length : 0;
      } catch (e: any) {
        this.logger.warn('Error flushing batch (withoutRef): ' + (e && e.message ? e.message : JSON.stringify(e)));
        if (e && Array.isArray(e.insertedDocs)) inserted += e.insertedDocs.length;
      }
    }

    return inserted;
  }

  /**
   * CSV processing (streamed). Uses batching and _flushBatch to avoid duplicates.
   */
  private async _processCsv(filePath: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const batch: any[] = [];
      let inserted = 0;
      const readStream = fs.createReadStream(filePath);
      const csvStream = csvParse({ headers: true, ignoreEmpty: true, trim: true });

      csvStream.on('error', (err) => {
        this.logger.error('CSV parse error: ' + (err && (err as Error).message ? (err as Error).message : err));
        reject(err);
      });

      csvStream.on('data', async (row: any) => {
        const doc = this._mapRowToDocument(row);
        batch.push(doc);

        if (batch.length >= this.BATCH_SIZE) {
          csvStream.pause();
          try {
            const toFlush = batch.splice(0, batch.length);
            const added = await this._flushBatch(toFlush);
            inserted += added;
          } catch (e: any) {
            this.logger.warn('Batch flush error (csv): ' + (e && e.message ? e.message : JSON.stringify(e)));
          } finally {
            csvStream.resume();
          }
        }
      });

      csvStream.on('end', async () => {
        if (batch.length) {
          try {
            const added = await this._flushBatch(batch.splice(0, batch.length));
            inserted += added;
          } catch (e: any) {
            this.logger.warn('Final batch flush error (csv): ' + (e && e.message ? e.message : JSON.stringify(e)));
          }
        }
        resolve(inserted);
      });

      readStream.pipe(csvStream);
    });
  }

  /**
   * XLSX processing (streamed). Uses batching and _flushBatch to avoid duplicates.
   */
  private async _processXlsx(filePath: string): Promise<number> {
    const readStream = fs.createReadStream(filePath);

    // ExcelJS streaming options (cast any to avoid types differences)
    const options: Partial<any> = {
      entries: 'emit',
      sharedStrings: 'cache',
      styles: 'ignore',
      hyperlinks: 'ignore',
      worksheets: 'emit',
    };

    // compatibility across exceljs versions
    const WorkbookReaderAny: any =
      (ExcelJS as any).stream?.xlsx?.WorkbookReader || (ExcelJS as any).stream?.WorkbookReader;
    const workbookReader = new WorkbookReaderAny(readStream as any, options as any);

    const batch: any[] = [];
    let inserted = 0;
    let headers: string[] = [];

    for await (const worksheetReader of workbookReader) {
      for await (const row of worksheetReader) {
        const values = (row as any).values as any[]; // ExcelJS row.values[0] often null
        // determine header row
        if (!headers.length) {
          headers = values.slice(1).map((v) => (v !== undefined && v !== null ? String(v).trim() : ''));
          // if header blank, keep scanning
          if (headers.every((h) => h === '')) {
            headers = [];
            continue;
          }
          // header consumed; next iterations will be data rows
          continue;
        }

        const rowObj: any = {};
        const cells = values.slice(1);
        for (let i = 0; i < headers.length; i++) {
          rowObj[headers[i] || `col_${i}`] = cells[i] !== undefined ? cells[i] : null;
        }

        batch.push(this._mapRowToDocument(rowObj));

        if (batch.length >= this.BATCH_SIZE) {
          try {
            const toFlush = batch.splice(0, batch.length);
            const added = await this._flushBatch(toFlush);
            inserted += added;
          } catch (e: any) {
            this.logger.warn('Batch flush error (xlsx): ' + (e && e.message ? e.message : JSON.stringify(e)));
          }
        }
      }
    }

    if (batch.length) {
      try {
        const added = await this._flushBatch(batch.splice(0, batch.length));
        inserted += added;
      } catch (e: any) {
        this.logger.warn('Final batch flush error (xlsx): ' + (e && e.message ? e.message : JSON.stringify(e)));
      }
    }

    return inserted;
  }

  /**
   * Build query filters for fetch/export endpoints
   */
  private _buildFilters(query: any) {
    const filters: any = {};
    if (query.category) filters.category = query.category;
    if (query.status) filters.status = query.status;

    if (query.startDate || query.endDate) {
      filters.createdAt = {};
      if (query.startDate) filters.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) {
        const d = new Date(query.endDate);
        d.setHours(23, 59, 59, 999);
        filters.createdAt.$lte = d;
      }
    }

    if (query.q) {
      filters.$or = [
        { 'payload.ticketRefId': { $regex: query.q, $options: 'i' } },
        { 'payload.description': { $regex: query.q, $options: 'i' } },
      ];
    }

    return filters;
  }

  /**
   * Paginated fetch
   */
  async fetch(query: any, paginate = { page: 1, limit: 50 }) {
    const filters = this._buildFilters(query);
    const page = paginate.page > 0 ? paginate.page : 1;
    const limit = paginate.limit > 0 ? paginate.limit : 50;

    const [items, total] = await Promise.all([
      this.uploadModel.find(filters).skip((page - 1) * limit).limit(limit).lean(),
      this.uploadModel.countDocuments(filters),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Stream CSV export (applies filters)
   */
  async streamExportCsv(res: Response, query: any) {
    const filters = this._buildFilters(query);
    const cursor = this.uploadModel.find(filters).lean().cursor();
    const csvStream = csvFormat({ headers: true });
    csvStream.pipe(res);

    try {
      for await (const doc of cursor) {
        const row = {
          ...doc.payload,
          category: doc.category,
          status: doc.status,
          createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : '',
        };
        csvStream.write(row);
      }
    } catch (err) {
      this.logger.error('Error while streaming CSV export: ' + (err && (err as Error).message ? (err as Error).message : err));
    } finally {
      csvStream.end();
    }

    return new Promise<void>((resolve) => csvStream.on('finish', () => resolve()));
  }

  /**
   * Stream XLSX export (applies filters)
   */
  async streamExportXlsx(res: Response, query: any) {
    const filters = this._buildFilters(query);
    const cursor = this.uploadModel.find(filters).lean().cursor();

    const WorkbookWriterAny: any = (ExcelJS as any).stream?.xlsx?.WorkbookWriter || (ExcelJS as any).stream?.WorkbookWriter;
    const workbook = new WorkbookWriterAny({ stream: res });
    const ws = workbook.addWorksheet('Export');

    let headerWritten = false;
    for await (const doc of cursor) {
      const rowObj = { ...doc.payload, category: doc.category, status: doc.status, createdAt: doc.createdAt };
      if (!headerWritten) {
        ws.addRow(Object.keys(rowObj)).commit();
        headerWritten = true;
      }
      ws.addRow(Object.values(rowObj)).commit();
    }
    await workbook.commit();
  }
}

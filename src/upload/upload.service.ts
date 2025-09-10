/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/prefer-promise-reject-errors,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unused-vars */


// src/upload/upload.service.ts
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
  private readonly BATCH_SIZE = Number(process.env.BATCH_SIZE || 1000);

  constructor(
    @InjectModel(UploadData.name)
    private readonly uploadModel: Model<UploadDataDocument>,
  ) {}

  /**
   * Parse the uploaded file (CSV or XLSX) and insert into DB using batched insertMany.
   * Returns { insertedCount, message }
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

      // Attempt to remove file after processing (non-blocking)
      fs.unlink(filePath, (err) => {
        if (err)
          this.logger.warn('Could not delete uploaded file: ' + err.message);
      });

      return { insertedCount: inserted, message: 'Imported successfully' };
    } catch (err) {
      this.logger.error(err);
      // try to delete on failure as well
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        /* ignore */
      }
      throw err;
    }
  }

  private _mapRowToDocument(row: Record<string, any>) {
    const doc: any = {
      payload: row,
      category:
        row['category'] || row['Category'] || row['category_name'] || null,
      status: row['status'] || row['Status'] || null,
    };

    const createdVal =
      row['createdAt'] ||
      row['created_at'] ||
      row['Created Date'] ||
      row['created'] ||
      null;
    if (createdVal) {
      const d = new Date(createdVal);
      if (!isNaN(d.getTime())) doc.createdAt = d;
    }

    return doc;
  }

  private async _processCsv(filePath: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const batch: any[] = [];
      let inserted = 0;
      const readStream = fs.createReadStream(filePath);
      const csvStream = csvParse({
        headers: true,
        ignoreEmpty: true,
        trim: true,
      });

      csvStream.on('error', (err) => {
        this.logger.error(
          'CSV parse error: ' + (err && err.message ? err.message : err),
        );
        reject(err);
      });

      csvStream.on('data', async (row: any) => {
        const doc = this._mapRowToDocument(row);
        batch.push(doc);
        if (batch.length >= this.BATCH_SIZE) {
          csvStream.pause();
          try {
            const res = await this.uploadModel.insertMany(
              batch.splice(0, batch.length),
              { ordered: false },
            );
            inserted += res.length;
          } catch (e: any) {
            this.logger.warn(
              'Batch insert error (csv): ' + (e && e.message ? e.message : e),
            );
          } finally {
            csvStream.resume();
          }
        }
      });

      csvStream.on('end', async () => {
        if (batch.length) {
          try {
            const res = await this.uploadModel.insertMany(
              batch.splice(0, batch.length),
              { ordered: false },
            );
            inserted += res.length;
          } catch (e: any) {
            this.logger.warn(
              'Final batch insert error (csv): ' +
                (e && e.message ? e.message : e),
            );
          }
        }
        resolve(inserted);
      });

      readStream.pipe(csvStream);
    });
  }

  private async _processXlsx(filePath: string): Promise<number> {
    const readStream = fs.createReadStream(filePath);

    // Use the correct ExcelJS type name: WorkbookStreamReaderOptions and valid string flags
    const options: Partial<ExcelJS.stream.xlsx.WorkbookStreamReaderOptions> = {
      entries: 'emit', // emit entry events
      sharedStrings: 'cache', // cache shared strings
      styles: 'ignore', // 'cache' | 'ignore' — use 'ignore' for performance
      hyperlinks: 'ignore', // 'cache' | 'emit' | 'ignore' — use 'ignore' for performance
      worksheets: 'emit', // emit worksheets
    };

    // workbook reader: use any cast to avoid typing mismatches across exceljs versions
    const workbookReader = new (ExcelJS as any).stream.xlsx.WorkbookReader(
      readStream as any,
      options as any,
    );

    const batch: any[] = [];
    let inserted = 0;
    let headers: string[] = [];

    for await (const worksheetReader of workbookReader) {
      for await (const row of worksheetReader) {
        const values = row.values as any[]; // ExcelJS: row.values[0] is null
        if (!headers.length) {
          headers = values
            .slice(1)
            .map((v) =>
              v !== undefined && v !== null ? String(v).trim() : '',
            );
          // if header row is empty, skip
          if (headers.every((h) => h === '')) continue;
          continue;
        }

        const rowObj: any = {};
        const cells = values.slice(1);
        for (let i = 0; i < headers.length; i++) {
          rowObj[headers[i] || `col_${i}`] =
            cells[i] !== undefined ? cells[i] : null;
        }

        batch.push(this._mapRowToDocument(rowObj));

        if (batch.length >= this.BATCH_SIZE) {
          try {
            const res = await this.uploadModel.insertMany(
              batch.splice(0, batch.length),
              { ordered: false },
            );
            inserted += res.length;
          } catch (e: any) {
            this.logger.warn(
              'Batch insert error (xlsx): ' + (e && e.message ? e.message : e),
            );
          }
        }
      }
    }

    if (batch.length) {
      try {
        const res = await this.uploadModel.insertMany(
          batch.splice(0, batch.length),
          { ordered: false },
        );
        inserted += res.length;
      } catch (e: any) {
        this.logger.warn(
          'Final batch insert error (xlsx): ' +
            (e && e.message ? e.message : e),
        );
      }
    }

    return inserted;
  }

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

  async fetch(query: any, paginate = { page: 1, limit: 50 }) {
    const filters = this._buildFilters(query);
    const page = paginate.page > 0 ? paginate.page : 1;
    const limit = paginate.limit > 0 ? paginate.limit : 50;

    const [items, total] = await Promise.all([
      this.uploadModel
        .find(filters)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.uploadModel.countDocuments(filters),
    ]);

    return { items, total, page, limit };
  }

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
      this.logger.error(
        'Error while streaming CSV export: ' +
          (err && (err as Error).message ? (err as Error).message : err),
      );
    } finally {
      csvStream.end();
    }

    return new Promise<void>((resolve) =>
      csvStream.on('finish', () => resolve()),
    );
  }

  async streamExportXlsx(res: Response, query: any) {
    const filters = this._buildFilters(query);
    const cursor = this.uploadModel.find(filters).lean().cursor();

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const ws = workbook.addWorksheet('Export');

    let headerWritten = false;
    for await (const doc of cursor) {
      const rowObj = {
        ...doc.payload,
        category: doc.category,
        status: doc.status,
        createdAt: doc.createdAt,
      };
      if (!headerWritten) {
        ws.addRow(Object.keys(rowObj)).commit();
        headerWritten = true;
      }
      ws.addRow(Object.values(rowObj)).commit();
    }
    await workbook.commit();
  }
}

// upload/upload.controller.ts
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Get,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  // ✅ Inline multer config here
  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const fileExtName = extname(file.originalname);
          cb(null, `${Date.now()}${fileExtName}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
      fileFilter: (req, file, cb) => {
        const allowed = ['.csv', '.xls', '.xlsx'];
        const ext = extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) {
          return cb(
            new BadRequestException('Only CSV, XLS, or XLSX files allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    const result = await this.uploadService.parseAndStore(
      file.path,
      file.originalname,
    );
    return {
      status: HttpStatus.OK,
      inserted: result.insertedCount,
      message: result.message,
    };
  }

  @Get()
  async fetch(
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('q') q?: string,
  ) {
    return this.uploadService.fetch(
      { category, status, startDate, endDate, q },
      { page: Number(page), limit: Number(limit) },
    );
  }

  @Get('export')
  async export(
    @Query('format') format = 'csv',
    @Query() query: any,
    @Res() res: Response,
  ) {
    const fmt = (format || 'csv').toLowerCase();
    if (fmt === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="export_${Date.now()}.csv"`,
      );
      await this.uploadService.streamExportCsv(res, query);
    } else {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="export_${Date.now()}.xlsx"`,
      );
      await this.uploadService.streamExportXlsx(res, query);
    }
    return res;
  }
}

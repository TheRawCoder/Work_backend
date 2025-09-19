import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadData, UploadDataSchema } from './schema/upload-data.schema';
import { UploadDataService } from './upload.service';
import { UploadDataController } from './upload.controller';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: UploadData.name, schema: UploadDataSchema }],
      'dashboard-data', // 👈 also use ticket_project connection
    ),
  ],
  providers: [UploadDataService],
  controllers: [UploadDataController],
  exports: [UploadDataService],
})
export class UploadDataModule { }

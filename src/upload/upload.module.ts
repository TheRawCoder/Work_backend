// upload/upload.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { UploadData, UploadDataSchema } from './schema/upload-data.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UploadData.name, schema: UploadDataSchema },
    ]),
  ],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}

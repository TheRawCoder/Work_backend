/* eslint-disable prettier/prettier */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import * as path from 'path';
import mongoose from 'mongoose';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  app.use((req, _res, next) => {
    if (req.url && req.url.includes('/upload-data/upload')) {
      console.log('>>> HEADER DEBUG for upload request: content-type =', req.headers['content-type']);
    }
    next();
  });

  app.use('/exports', express.static(path.join(process.cwd(), 'exports')));

  setTimeout(() => {
    try {
      const names = mongoose.connections.map((c) => c.name || '(default)');
      console.log('DEBUG: mongoose.connections names =>', names);
      mongoose.connections.forEach((c) => {
        console.log(`DEBUG: connection '${c.name || '(default)'}' models =>`, Object.keys(c.models));
      });
    } catch (err) {
      console.error('DEBUG: failed to read mongoose.connections', err);
    }
  }, 1000);

  // print MONGO_URI env for clarity (redact in logs if sensitive)
  console.log('DEBUG ENV MONGO_URI=', process.env.MONGO_URI);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  console.log(`✅ Backend running on http://localhost:${port}`);
}

void bootstrap();

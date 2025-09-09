import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  stats() {
    return this.admin.getStats();
  }
}

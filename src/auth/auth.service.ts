/* eslint-disable @typescript-eslint/no-explicit-any */
// src/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { OTP, OTPDocument } from '../users/schema/otp.schema';
import { EmailService } from './email.service';
import { ForgotPasswordDto } from '../users/dto/forgot-password.dto';
import { VerifyOTPDto } from '../users/dto/verify-otp.dto';
import { ResetPasswordDto } from '../users/dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    @InjectModel(OTP.name, 'dashboard-data') private readonly otpModel: Model<OTPDocument>,
    private readonly emailService: EmailService,
  ) { }

  async validateUser(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isValid = await bcrypt.compare(password, (user as any).password);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const payload = {
      sub: (user as any)._id,
      email: (user as any).email,
      isAdmin: (user as any).isAdmin,
    };

    return {
      success: true,
      message: 'Login successful',
      access_token: this.jwt.sign(payload),
    };
  }

  async register(dto: CreateUserDto) {
    const exists = await this.users.findByEmail(dto.email);
    if (exists) throw new ConflictException('Email already registered');

    const user = await this.users.create(dto);
    const payload = {
      sub: (user as any)._id,
      email: (user as any).email,
      isAdmin: (user as any).isAdmin,
    };

    return {
      success: true,
      message: 'User registered successfully',
      access_token: this.jwt.sign(payload),
    };
  }

  // Generate 4-digit OTP
  private generateOTP(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const { email } = dto;

    const user = await this.users.findByEmail(email);

    if (!user) {
      // Security best practice: don’t reveal user existence
      return {
        success: true,
        message: 'If an account with this email exists, an OTP has been sent.',
      };
    }

    const otp = this.generateOTP();

    // remove old OTPs for this email and create a fresh one
    await this.otpModel.deleteMany({ email });
    await this.otpModel.create({ email, otp, isUsed: false });

    try {
      await this.emailService.sendOTPEmail(email, otp);
    } catch (error) {
      console.error('Email send failed', error);
      throw new BadRequestException('Failed to send OTP email');
    }

    return {
      success: true,
      message: 'OTP sent to your email address',
    };
  }

  async verifyOTP(dto: VerifyOTPDto) {
    const { email, otp } = dto;

    const otpRecord = await this.otpModel.findOne({
      email,
      otp,
      isUsed: false,
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    otpRecord.isUsed = true;
    await otpRecord.save();

    return {
      success: true,
      message: 'OTP verified successfully',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const { email, otp, newPassword, confirmPassword } = dto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // require a verified OTP (isUsed: true) created recently
    const otpRecord = await this.otpModel.findOne({
      email,
      otp,
      isUsed: true,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP session');
    }

    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await this.users.updatePassword((user as any)._id, hashedPassword);
    await this.otpModel.deleteMany({ email });

    return {
      success: true,
      message: 'Password reset successfully',
    };
  }

  // ✅ JWT Validation
  async validateToken(token: string) {
    try {
      const payload = this.jwt.verify(token);
      const user = await this.users.findByEmail(payload.email);

      if (!user) throw new UnauthorizedException('User not found');

      return {
        success: true,
        message: 'Token is valid',
        user: {
          id: (user as any)._id,
          email: (user as any).email,
          isAdmin: (user as any).isAdmin,
        },
      };
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

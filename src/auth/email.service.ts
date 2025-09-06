import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail', // ✅ use Gmail preset
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async sendOTPEmail(email: string, otp: string): Promise<void> {
    const mailOptions = {
      from: `"Your Dashboard" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset OTP - Your Dashboard',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #667eea; margin-bottom: 10px;">Password Reset Request</h1>
            <p style="color: #666; font-size: 16px;">We received a request to reset your password</p>
          </div>
          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <p style="color: #333; font-size: 18px; margin-bottom: 20px;">Your verification code is:</p>
            <div style="background-color: #667eea; color: white; padding: 15px 30px; border-radius: 6px; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${otp}</span>
            </div>
          </div>
          <div style="margin: 30px 0; padding: 20px; background-color: #fff3cd; border-radius: 6px; border-left: 4px solid #ffc107;">
            <p style="color: #856404; margin: 0; font-size: 14px;">
              <strong>Important:</strong> This OTP will expire in 10 minutes. If you didn't request this password reset, please ignore this email.
            </p>
          </div>
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; font-size: 12px;">
              This is an automated message, please do not reply to this email.
            </p>
          </div>
        </div>
      `,
    };

    await this.transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${email}: ${otp}`); // debug log
  }
}

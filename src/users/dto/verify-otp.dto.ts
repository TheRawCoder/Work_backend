import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class VerifyOTPDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(4)
    @MaxLength(4)
    otp: string;
}

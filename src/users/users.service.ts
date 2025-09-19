// src/users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schema/users.schema';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name, 'dashboard-data') private userModel: Model<UserDocument>) { }

  // Get all users (without passwords)
  async findAll(): Promise<User[]> {
    return this.userModel.find().select('-password').lean();
  }

  // Get single user by ID
  async findOne(id: string): Promise<User> {
    const user = await this.userModel.findById(id).select('-password').lean();
    if (!user) throw new NotFoundException('User not found');
    return user as any;
  }

  // Create a new user
  async create(userData: Partial<User>): Promise<User> {
    if (!userData.password) {
      throw new Error('Password is required');
    }
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user = new this.userModel({ ...userData, password: hashedPassword });
    return user.save();
  }

  // Update user
  async update(id: string, updateData: Partial<User>): Promise<User> {
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .select('-password')
      .lean();
    if (!updatedUser) throw new NotFoundException('User not found');
    return updatedUser as any;
  }

  // Delete user
  async remove(id: string): Promise<void> {
    const result = await this.userModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('User not found');
  }

  // Find user by email
  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  // Update password helper
  async updatePassword(userId: string, hashedPassword: string) {
    return await this.userModel.updateOne({ _id: userId }, { password: hashedPassword });
  }

  // Validate user (login)
  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userModel.findOne({ email }).exec();
    if (!user) return null;
    const passwordMatches = await bcrypt.compare(password, (user as any).password);
    if (!passwordMatches) return null;
    return user as any;
  }

  // Optional: stats
  async getUserStats() {
    const totalUsers = await this.userModel.countDocuments();
    return { totalUsers };
  }
}

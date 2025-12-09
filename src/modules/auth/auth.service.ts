import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../entities/user.entity';
import { Wallet } from '../../entities/wallet.entity';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    private jwtService: JwtService,
    private dataSource: DataSource,
  ) {}

  async validateGoogleUser(googleUser: {
    googleId: string;
    email: string;
    displayName: string;
    profilePicture: string;
  }): Promise<User> {
    // Use transaction to ensure user and wallet are created atomically
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let user = await queryRunner.manager.findOne(User, {
        where: { googleId: googleUser.googleId },
        relations: ['wallet'],
      });

      if (!user) {
        // Create new user
        user = queryRunner.manager.create(User, {
          googleId: googleUser.googleId,
          email: googleUser.email,
          displayName: googleUser.displayName,
          profilePicture: googleUser.profilePicture,
        });

        user = await queryRunner.manager.save(User, user);

        // Create wallet for new user
        const walletNumber = this.generateWalletNumber();
        const wallet = queryRunner.manager.create(Wallet, {
          walletNumber,
          userId: user.id,
          balance: 0,
        });

        await queryRunner.manager.save(Wallet, wallet);
        user.wallet = wallet;
      }

      await queryRunner.commitTransaction();
      return user;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  generateJwtToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
    };

    return this.jwtService.sign(payload);
  }

  private generateWalletNumber(): string {
    // Generate a 13-digit wallet number
    const timestamp = Date.now().toString().slice(-10);
    const random = crypto.randomInt(100, 999).toString();
    return timestamp + random;
  }
}
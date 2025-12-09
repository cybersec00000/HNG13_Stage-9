import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { ApiKey } from '../../entities/api-key.entity';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Try JWT first
    const token = this.extractTokenFromHeader(request);
    if (token) {
      try {
        const payload = await this.jwtService.verifyAsync(token, {
          secret: this.configService.get('JWT_SECRET'),
        });

        const user = await this.userRepository.findOne({
          where: { id: payload.sub },
          relations: ['wallet'],
        });

        if (!user) {
          throw new UnauthorizedException('User not found');
        }

        request.user = user;
        request.authType = 'jwt';
        return true;
      } catch (error) {
        throw new UnauthorizedException('Invalid or expired token');
      }
    }

    // Try API Key
    const apiKey = request.headers['x-api-key'];
    if (apiKey) {
      return this.validateApiKey(apiKey, request);
    }

    throw new UnauthorizedException('No authentication credentials provided');
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private async validateApiKey(apiKey: string, request: any): Promise<boolean> {
    // Extract prefix for faster lookup
    const prefix = apiKey.substring(0, 12); // "sk_live_xxxx"

    // Find potential matching keys
    const keys = await this.apiKeyRepository.find({
      where: { keyPrefix: prefix },
      relations: ['user', 'user.wallet'],
    });

    // Hash the provided key and compare
    for (const keyRecord of keys) {
      const isMatch = await bcrypt.compare(apiKey, keyRecord.keyHash);

      if (isMatch) {
        // Check if expired
        if (new Date() > keyRecord.expiresAt) {
          throw new UnauthorizedException('API key has expired');
        }

        // Check if revoked
        if (keyRecord.isRevoked) {
          throw new UnauthorizedException('API key has been revoked');
        }

        request.user = keyRecord.user;
        request.apiKeyPermissions = keyRecord.permissions;
        request.authType = 'apikey';
        return true;
      }
    }

    throw new UnauthorizedException('Invalid API key');
  }
}
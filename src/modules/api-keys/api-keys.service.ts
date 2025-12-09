import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../../entities/api-key.entity';
import { User } from '../../entities/user.entity';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RolloverApiKeyDto } from './dto/rollover-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
  ) {}

  async createApiKey(
    user: User,
    createApiKeyDto: CreateApiKeyDto,
  ): Promise<{ api_key: string; expires_at: Date }> {
    // Check active key count (max 5)
    const activeKeysCount = await this.apiKeyRepository.count({
      where: {
        userId: user.id,
        isRevoked: false,
      },
    });

    if (activeKeysCount >= 5) {
      throw new BadRequestException(
        'Maximum of 5 active API keys allowed. Please revoke an existing key first.',
      );
    }

    // Generate API key
    const rawKey = this.generateRawApiKey();

    // Hash the key
    const keyHash = await bcrypt.hash(rawKey, 10);

    // Extract prefix (first 12 chars for quick lookup)
    const keyPrefix = rawKey.substring(0, 12);

    // Calculate expiry
    const expiresAt = this.calculateExpiry(createApiKeyDto.expiry);

    // Create API key record
    const apiKey = this.apiKeyRepository.create({
      name: createApiKeyDto.name,
      keyHash,
      keyPrefix,
      permissions: createApiKeyDto.permissions,
      expiresAt,
      userId: user.id,
    });

    await this.apiKeyRepository.save(apiKey);

    // Return raw key (only time user sees it!)
    return {
      api_key: rawKey,
      expires_at: expiresAt,
    };
  }

  async rolloverApiKey(
    user: User,
    rolloverDto: RolloverApiKeyDto,
  ): Promise<{ api_key: string; expires_at: Date }> {
    // Find the expired key
    const oldKey = await this.apiKeyRepository.findOne({
      where: {
        id: rolloverDto.expired_key_id,
        userId: user.id,
      },
    });

    if (!oldKey) {
      throw new NotFoundException('API key not found');
    }

    // Verify it's actually expired
    if (new Date() <= oldKey.expiresAt) {
      throw new BadRequestException('API key has not expired yet');
    }

    // Check active key count (max 5)
    const activeKeysCount = await this.apiKeyRepository.count({
      where: {
        userId: user.id,
        isRevoked: false,
      },
    });

    if (activeKeysCount >= 5) {
      throw new BadRequestException(
        'Maximum of 5 active API keys allowed. Please revoke an existing key first.',
      );
    }

    // Generate new API key with same permissions
    const rawKey = this.generateRawApiKey();
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.substring(0, 12);
    const expiresAt = this.calculateExpiry(rolloverDto.expiry);

    // Create new API key with old permissions
    const newApiKey = this.apiKeyRepository.create({
      name: oldKey.name + ' (Rolled Over)',
      keyHash,
      keyPrefix,
      permissions: oldKey.permissions, // Reuse permissions
      expiresAt,
      userId: user.id,
    });

    await this.apiKeyRepository.save(newApiKey);

    return {
      api_key: rawKey,
      expires_at: expiresAt,
    };
  }

  async listApiKeys(user: User): Promise<any[]> {
    const keys = await this.apiKeyRepository.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      permissions: key.permissions,
      expires_at: key.expiresAt,
      is_revoked: key.isRevoked,
      is_expired: new Date() > key.expiresAt,
      created_at: key.createdAt,
      key_prefix: key.keyPrefix.substring(0, 8) + '...', // Show partial key
    }));
  }

  async revokeApiKey(user: User, keyId: string): Promise<void> {
    const key = await this.apiKeyRepository.findOne({
      where: { id: keyId, userId: user.id },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    key.isRevoked = true;
    await this.apiKeyRepository.save(key);
  }

  private generateRawApiKey(): string {
    // Format: sk_live_<32_random_chars>
    const randomBytes = crypto.randomBytes(24).toString('hex');
    return `sk_live_${randomBytes}`;
  }

  private calculateExpiry(expiry: '1H' | '1D' | '1M' | '1Y'): Date {
    const now = new Date();

    switch (expiry) {
      case '1H':
        return new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
      case '1D':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day
      case '1M':
        return new Date(now.setMonth(now.getMonth() + 1)); // 1 month
      case '1Y':
        return new Date(now.setFullYear(now.getFullYear() + 1)); // 1 year
      default:
        throw new BadRequestException('Invalid expiry format');
    }
  }
}
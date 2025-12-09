import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../entities/user.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RolloverApiKeyDto } from './dto/rollover-api-key.dto';

@Controller('keys')
@UseGuards(AuthGuard)
export class ApiKeysController {
  constructor(private apiKeysService: ApiKeysService) {}

  @Post('create')
  async createApiKey(
    @CurrentUser() user: User,
    @Body() createApiKeyDto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.createApiKey(user, createApiKeyDto);
  }

  @Post('rollover')
  async rolloverApiKey(
    @CurrentUser() user: User,
    @Body() rolloverDto: RolloverApiKeyDto,
  ) {
    return this.apiKeysService.rolloverApiKey(user, rolloverDto);
  }

  @Get()
  async listApiKeys(@CurrentUser() user: User) {
    return this.apiKeysService.listApiKeys(user);
  }

  @Delete(':id')
  async revokeApiKey(@CurrentUser() user: User, @Param('id') keyId: string) {
    await this.apiKeysService.revokeApiKey(user, keyId);
    return { message: 'API key revoked successfully' };
  }
}
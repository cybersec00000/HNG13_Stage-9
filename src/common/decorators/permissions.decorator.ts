import { SetMetadata } from '@nestjs/common';
import { ApiKeyPermission } from '../../entities/api-key.entity';

export const Permissions = (...permissions: ApiKeyPermission[]) =>
  SetMetadata('permissions', permissions);
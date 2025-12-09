import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyPermission } from '../../entities/api-key.entity';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<ApiKeyPermission[]>(
      'permissions',
      context.getHandler(),
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No specific permissions required
    }

    const request = context.switchToHttp().getRequest();

    // If authenticated via JWT, allow all actions
    if (request.authType === 'jwt') {
      return true;
    }

    // If authenticated via API key, check permissions
    if (request.authType === 'apikey') {
      const userPermissions = request.apiKeyPermissions || [];

      const hasPermission = requiredPermissions.every((permission) =>
        userPermissions.includes(permission),
      );

      if (!hasPermission) {
        throw new ForbiddenException(
          `Missing required permissions: ${requiredPermissions.join(', ')}`,
        );
      }

      return true;
    }

    throw new ForbiddenException('Invalid authentication type');
  }
}
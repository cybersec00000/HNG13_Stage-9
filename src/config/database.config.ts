import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { Transaction } from '../entities/transaction.entity';
import { ApiKey } from '../entities/api-key.entity';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const isProduction = configService.get('NODE_ENV') === 'production';
  const entities = [User, Wallet, Transaction, ApiKey];

  const databaseUrl = configService.get('DATABASE_URL');
  
  if (databaseUrl) {
    return {
      type: 'postgres',
      url: databaseUrl,
      entities,
      migrations: ['dist/migrations/*{.ts,.js}'],
      synchronize: false,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      logging: !isProduction,
      migrationsRun: true,
      extra: {
        max: 10,
        connectionTimeoutMillis: 10000,
      },
    };
  }

  return {
    type: 'postgres',
    host: configService.get('DATABASE_HOST', 'localhost'),
    port: configService.get('DATABASE_PORT', 5432),
    username: configService.get('DATABASE_USER'),
    password: configService.get('DATABASE_PASSWORD'),
    database: configService.get('DATABASE_NAME'),
    entities,
    migrations: ['dist/migrations/*{.ts,.js}'],
    synchronize: !isProduction,
    ssl: false,
    logging: true,
    migrationsRun: !isProduction,
    extra: {
      max: 10,
      connectionTimeoutMillis: 10000,
    },
  };
};
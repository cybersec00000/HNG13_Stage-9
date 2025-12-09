import { IsString, IsEnum, IsArray, ArrayMinSize } from 'class-validator';
import { ApiKeyPermission } from '../../../entities/api-key.entity';

export class CreateApiKeyDto {
  @IsString()
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ApiKeyPermission, { each: true })
  permissions: ApiKeyPermission[];

  @IsString()
  @IsEnum(['1H', '1D', '1M', '1Y'])
  expiry: '1H' | '1D' | '1M' | '1Y';
}
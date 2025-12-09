import { IsString, IsEnum } from 'class-validator';

export class RolloverApiKeyDto {
  @IsString()
  expired_key_id: string;

  @IsString()
  @IsEnum(['1H', '1D', '1M', '1Y'])
  expiry: '1H' | '1D' | '1M' | '1Y';
}
import { IsString, IsNumber, Min } from 'class-validator';

export class TransferDto {
  @IsString()
  wallet_number: string;

  @IsNumber()
  @Min(100, { message: 'Minimum transfer amount is ₦100' })
  amount: number;
}
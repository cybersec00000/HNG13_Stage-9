import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  RawBodyRequest,
  BadRequestException,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../entities/user.entity';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';
import { ApiKeyPermission } from '../../entities/api-key.entity';
import { PaystackService } from '../paystack/paystack.service';

@Controller('wallet')
export class WalletController {
  constructor(
    private walletService: WalletService,
    private paystackService: PaystackService,
  ) {}

  @Post('deposit')
  @UseGuards(AuthGuard, PermissionsGuard)
  @Permissions(ApiKeyPermission.DEPOSIT)
  async deposit(@CurrentUser() user: User, @Body() depositDto: DepositDto) {
    return this.walletService.initiateDeposit(user, depositDto);
  }

  @Post('paystack/webhook')
  async paystackWebhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['x-paystack-signature'] as string;

    if (!signature) {
      throw new BadRequestException('Missing Paystack signature');
    }

    // Get raw body for signature verification
    const rawBody = JSON.stringify(req.body);

    // Verify signature
    const isValid = this.paystackService.verifyWebhookSignature(
      rawBody,
      signature,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid Paystack signature');
    }

    // Process webhook
    await this.walletService.handlePaystackWebhook(req.body);

    return { status: true };
  }

  @Get('deposit/:reference/status')
  @UseGuards(AuthGuard, PermissionsGuard)
  @Permissions(ApiKeyPermission.READ)
  async getDepositStatus(
    @CurrentUser() user: User,
    @Param('reference') reference: string,
  ) {
    return this.walletService.getDepositStatus(user, reference);
  }

  @Get('balance')
  @UseGuards(AuthGuard, PermissionsGuard)
  @Permissions(ApiKeyPermission.READ)
  async getBalance(@CurrentUser() user: User) {
    return this.walletService.getBalance(user);
  }

  @Post('transfer')
  @UseGuards(AuthGuard, PermissionsGuard)
  @Permissions(ApiKeyPermission.TRANSFER)
  async transfer(@CurrentUser() user: User, @Body() transferDto: TransferDto) {
    return this.walletService.transfer(user, transferDto);
  }

  @Get('transactions')
  @UseGuards(AuthGuard, PermissionsGuard)
  @Permissions(ApiKeyPermission.READ)
  async getTransactions(@CurrentUser() user: User) {
    return this.walletService.getTransactions(user);
  }
}
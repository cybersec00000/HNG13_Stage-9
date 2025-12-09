import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Query,
  Res,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { PaystackService } from './paystack.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction, TransactionStatus } from '../../entities/transaction.entity';
import { Wallet } from '../../entities/wallet.entity';

@Controller('paystack')
export class PaystackController {
  private readonly logger = new Logger(PaystackController.name);

  constructor(
    private paystackService: PaystackService,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Body() body: any,
    @Headers('x-paystack-signature') signature: string,
  ) {
    this.logger.log('📥 Webhook received from Paystack');

    // Get raw body for signature verification
    const payload = JSON.stringify(body);

    // Verify signature
    const isValid = this.paystackService.verifyWebhookSignature(
      payload,
      signature,
    );

    if (!isValid) {
      this.logger.error('❌ Invalid webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event = body;
    this.logger.log(`✅ Webhook verified. Event: ${event.event}`);

    // Handle charge.success event
    if (event.event === 'charge.success') {
      const { reference, amount, status } = event.data;

      this.logger.log(
        `💰 Processing payment: ${reference}, Amount: ${amount / 100}, Status: ${status}`,
      );

      // Find the transaction
      const transaction = await this.transactionRepository.findOne({
        where: { reference },
        relations: ['wallet'],
      });

      if (!transaction) {
        this.logger.error(`❌ Transaction not found: ${reference}`);
        return { status: 'error', message: 'Transaction not found' };
      }

      if (transaction.status === TransactionStatus.SUCCESS) {
        this.logger.warn(`⚠️ Transaction already processed: ${reference}`);
        return { status: 'success', message: 'Already processed' };
      }

      // Update transaction status
      transaction.status = TransactionStatus.SUCCESS;
      await this.transactionRepository.save(transaction);

      // Credit wallet
      const wallet = transaction.wallet;
      const currentBalance = parseFloat(wallet.balance.toString());
      const newBalance = currentBalance + amount / 100;
      wallet.balance = newBalance;
      await this.walletRepository.save(wallet);

      this.logger.log(
        `✅ Wallet credited: ${wallet.walletNumber}, New balance: ${wallet.balance}`,
      );
    }

    return { status: 'success' };
  }

  // ADD THIS CALLBACK ENDPOINT
  @Get('callback')
  async paymentCallback(
    @Query('reference') reference: string,
    @Res() res: Response,
  ) {
    this.logger.log(`🔄 Payment callback received for: ${reference}`);

    try {
      // Verify the transaction with Paystack
      const verification = await this.paystackService.verifyTransaction(reference);

      if (verification.status && verification.data.status === 'success') {
        this.logger.log(`✅ Payment verified: ${reference}`);

        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Payment Successful</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .container {
                  background: white;
                  padding: 2rem;
                  border-radius: 10px;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                  text-align: center;
                  max-width: 500px;
                }
                h1 { color: #28a745; }
                .message { color: #666; margin: 1rem 0; }
                .info { background: #f5f5f5; padding: 1rem; border-radius: 5px; margin-top: 1rem; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>✅ Payment Successful!</h1>
                <p class="message">Your payment has been processed successfully.</p>
                <div class="info">
                  <p><strong>Reference:</strong> ${reference}</p>
                  <p><strong>Amount:</strong> ₦${verification.data.amount / 100}</p>
                </div>
                <p class="message">Your wallet will be credited shortly.</p>
              </div>
            </body>
          </html>
        `);
      } else {
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Payment Failed</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: #f8d7da;
                }
                .container {
                  background: white;
                  padding: 2rem;
                  border-radius: 10px;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                  text-align: center;
                  max-width: 500px;
                }
                h1 { color: #dc3545; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>❌ Payment Failed</h1>
                <p>Your payment could not be processed. Please try again.</p>
              </div>
            </body>
          </html>
        `);
      }
    } catch (error) {
      this.logger.error(`❌ Payment verification failed: ${error.message}`);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Error</title>
          </head>
          <body>
            <h1>Error verifying payment</h1>
            <p>${error.message}</p>
          </body>
        </html>
      `);
    }
  }
}
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Wallet } from '../../entities/wallet.entity';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../../entities/transaction.entity';
import { User } from '../../entities/user.entity';
import { PaystackService } from '../paystack/paystack.service';
import { DepositDto } from './dto/deposit.dto';
import { TransferDto } from './dto/transfer.dto';
import * as crypto from 'crypto';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private paystackService: PaystackService,
    private dataSource: DataSource,
  ) {}

  async initiateDeposit(
    user: User,
    depositDto: DepositDto,
  ): Promise<{ reference: string; authorization_url: string }> {
    const wallet = await this.walletRepository.findOne({
      where: { userId: user.id },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Generate unique reference
    const reference = this.generateReference();

    // Create pending transaction
    const transaction = this.transactionRepository.create({
      walletId: wallet.id,
      type: TransactionType.DEPOSIT,
      amount: depositDto.amount,
      status: TransactionStatus.PENDING,
      reference,
    });

    await this.transactionRepository.save(transaction);

    // Initialize Paystack payment
    const paystackResponse = await this.paystackService.initializeTransaction(
      user.email,
      depositDto.amount,
      reference,
    );

    return {
      reference: paystackResponse.data.reference,
      authorization_url: paystackResponse.data.authorization_url,
    };
  }

  async handlePaystackWebhook(payload: any): Promise<void> {
    const { event, data } = payload;

    // We only care about successful charges
    if (event !== 'charge.success') {
      return;
    }

    const reference = data.reference;

    // Use transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find the transaction
      const transaction = await queryRunner.manager.findOne(Transaction, {
        where: { reference },
        relations: ['wallet'],
        lock: { mode: 'pessimistic_write' }, // Lock to prevent race conditions
      });

      if (!transaction) {
        throw new NotFoundException(
          `Transaction with reference ${reference} not found`,
        );
      }

      // Idempotency check: if already successful, skip
      if (transaction.status === TransactionStatus.SUCCESS) {
        await queryRunner.commitTransaction();
        return;
      }

      // Update transaction status
      transaction.status = TransactionStatus.SUCCESS;
      await queryRunner.manager.save(Transaction, transaction);

      // Credit wallet
      const wallet = transaction.wallet;
      wallet.balance = Number(wallet.balance) + Number(transaction.amount);
      await queryRunner.manager.save(Wallet, wallet);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getDepositStatus(
    user: User,
    reference: string,
  ): Promise<{ reference: string; status: string; amount: number }> {
    const transaction = await this.transactionRepository.findOne({
      where: { reference },
      relations: ['wallet'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Verify it belongs to the user
    if (transaction.wallet.userId !== user.id) {
      throw new BadRequestException('Unauthorized access to transaction');
    }

    return {
      reference: transaction.reference,
      status: transaction.status,
      amount: Number(transaction.amount),
    };
  }

  async getBalance(user: User): Promise<{ balance: number }> {
    const wallet = await this.walletRepository.findOne({
      where: { userId: user.id },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return {
      balance: Number(wallet.balance),
    };
  }

  async transfer(
    user: User,
    transferDto: TransferDto,
  ): Promise<{ status: string; message: string }> {
    // Use transaction for atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find sender's wallet
      const senderWallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId: user.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!senderWallet) {
        throw new NotFoundException('Sender wallet not found');
      }

      // Find recipient's wallet
      const recipientWallet = await queryRunner.manager.findOne(Wallet, {
        where: { walletNumber: transferDto.wallet_number },
        lock: { mode: 'pessimistic_write' },
      });

      if (!recipientWallet) {
        throw new NotFoundException('Recipient wallet not found');
      }

      // Prevent self-transfer
      if (senderWallet.id === recipientWallet.id) {
        throw new BadRequestException('Cannot transfer to yourself');
      }

      // Check sufficient balance
      if (Number(senderWallet.balance) < transferDto.amount) {
        throw new BadRequestException('Insufficient balance');
      }

      // Deduct from sender
      senderWallet.balance =
        Number(senderWallet.balance) - transferDto.amount;
      await queryRunner.manager.save(Wallet, senderWallet);

      // Add to recipient
      recipientWallet.balance =
        Number(recipientWallet.balance) + transferDto.amount;
      await queryRunner.manager.save(Wallet, recipientWallet);

      // Create transaction records for both parties
      const senderTransaction = queryRunner.manager.create(Transaction, {
        walletId: senderWallet.id,
        type: TransactionType.TRANSFER_OUT,
        amount: transferDto.amount,
        status: TransactionStatus.SUCCESS,
        recipientWalletNumber: recipientWallet.walletNumber,
      });

      const recipientTransaction = queryRunner.manager.create(Transaction, {
        walletId: recipientWallet.id,
        type: TransactionType.TRANSFER_IN,
        amount: transferDto.amount,
        status: TransactionStatus.SUCCESS,
        senderWalletNumber: senderWallet.walletNumber,
      });

      await queryRunner.manager.save(Transaction, [
        senderTransaction,
        recipientTransaction,
      ]);

      await queryRunner.commitTransaction();

      return {
        status: 'success',
        message: 'Transfer completed successfully',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getTransactions(user: User): Promise<any[]> {
    const wallet = await this.walletRepository.findOne({
      where: { userId: user.id },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const transactions = await this.transactionRepository.find({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      take: 50, // Limit to last 50 transactions
    });

    return transactions.map((txn) => ({
      id: txn.id,
      type: txn.type,
      amount: Number(txn.amount),
      status: txn.status,
      reference: txn.reference,
      recipient_wallet_number: txn.recipientWalletNumber,
      sender_wallet_number: txn.senderWalletNumber,
      created_at: txn.createdAt,
    }));
  }

  private generateReference(): string {
    return `TXN_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }
}
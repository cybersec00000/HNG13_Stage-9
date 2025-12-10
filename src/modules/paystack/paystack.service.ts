import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

export interface InitializePaymentResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

@Injectable()
export class PaystackService {
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.secretKey = this.configService.get('PAYSTACK_SECRET_KEY');
  }

  async initializeTransaction(
    email: string,
    amount: number,
    reference: string,
  ): Promise<InitializePaymentResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transaction/initialize`,
          {
            email,
            amount: amount * 100,
            reference,
            callback_url: `${this.configService.get('BACKEND_URL')}/paystack/callback`,
          },
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      throw new BadRequestException(
        'Failed to initialize Paystack transaction: ' +
          error.response?.data?.message || error.message,
      );
    }
  }

  async verifyTransaction(reference: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
            },
          },
        ),
      );

      return response.data;
    } catch (error) {
      throw new BadRequestException(
        'Failed to verify transaction: ' +
          error.response?.data?.message || error.message,
      );
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(payload)
      .digest('hex');

    return hash === signature;
  }
}
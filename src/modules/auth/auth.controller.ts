import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Initiates Google OAuth flow
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Req() req, @Res() res: Response) {
    try {
      // Validate and create/find user
      const user = await this.authService.validateGoogleUser(req.user);

      // Generate JWT
      const token = this.authService.generateJwtToken(user);

      // Return JSON response
      return res.json({
        success: true,
        message: 'Google authentication successful',
        token: token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          profilePicture: user.profilePicture,
          wallet: user.wallet ? {
            id: user.wallet.id,
            walletNumber: user.wallet.walletNumber,
            balance: user.wallet.balance,
          } : null,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Authentication failed',
        error: error.message,
      });
    }
  }
}
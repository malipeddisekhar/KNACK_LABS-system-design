import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Principal } from './auth.types';

type AuthenticatedRequest = Request & { user?: Principal };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token is required.');
    }

    try {
      request.user = await this.authService.verifyToken(
        authorization.slice('Bearer '.length),
      );
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }
}

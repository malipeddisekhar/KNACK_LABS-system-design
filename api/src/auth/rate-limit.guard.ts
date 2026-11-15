import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RATE_LIMIT_KEY } from './rate-limit.decorator';

type RateLimitOptions = { limit: number; windowMs: number };

type RateLimitedRequest = Request & {
  user?: { principalId: string };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly requests = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RateLimitedRequest>();
    const key = `${request.user?.principalId ?? request.ip}:${request.method}:${request.path}`;
    const now = Date.now();
    const timestamps = (this.requests.get(key) ?? []).filter(
      (timestamp) => now - timestamp < options.windowMs,
    );

    if (timestamps.length >= options.limit) {
      throw new HttpException('Rate limit exceeded.', HttpStatus.TOO_MANY_REQUESTS);
    }

    timestamps.push(now);
    this.requests.set(key, timestamps);
    return true;
  }
}

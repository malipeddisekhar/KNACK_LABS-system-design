import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export type RequestWithId = Request & { requestId: string };

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const incomingId = req.get('X-Request-ID');
    const id = incomingId && /^[A-Za-z0-9._-]{1,128}$/.test(incomingId)
      ? incomingId
      : randomUUID();
    req.requestId = id;
    res.setHeader('X-Request-ID', id);
    next();
  }
}


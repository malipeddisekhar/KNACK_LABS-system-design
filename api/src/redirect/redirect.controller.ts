import { Controller, Get, Param, Redirect, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RateLimit } from '../auth/rate-limit.decorator';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { LinksService } from '../links/links.service';

@Controller('r')
export class RedirectController {
  constructor(private readonly linksService: LinksService) {}

  @Get(':code')
  @Redirect()
  @UseGuards(RateLimitGuard)
  @RateLimit(120)
  async redirect(@Param('code') code: string, @Req() request: Request) {
    const url = await this.linksService.getRedirectTarget(
      code,
      request as Request & { requestId?: string },
    );
    return { url, statusCode: 302 };
  }
}

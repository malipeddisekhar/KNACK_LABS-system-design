import { Controller, Get } from '@nestjs/common';

@Controller(['health', 'live'])
export class HealthController {
  @Get()
  getHealth(): { ok: true } {
    return { ok: true };
  }
}

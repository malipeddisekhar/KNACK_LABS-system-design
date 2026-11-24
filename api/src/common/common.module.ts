import { Module } from '@nestjs/common';
import { AppLogger } from './app-logger.service.js';

@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class CommonModule {}

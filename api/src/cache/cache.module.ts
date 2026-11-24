import { Module } from '@nestjs/common';
import { CacheService } from './cache.service.js';
import { CommonModule } from '../common/common.module.js';

@Module({
  imports: [CommonModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}


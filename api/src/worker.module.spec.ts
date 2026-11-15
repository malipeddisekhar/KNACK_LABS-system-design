import { WorkerModule } from './worker.module.js';
import { AppModule } from './app.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AnalyticsProcessor } from './analytics/analytics.processor.js';
import { AnalyticsService } from './analytics/analytics.service.js';
import { MODULE_METADATA } from '@nestjs/common/constants.js';

describe('WorkerModule and AppModule Separation (unit)', () => {
  it('registers AnalyticsProcessor in WorkerModule providers', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WorkerModule) || [];
    expect(providers).toContain(AnalyticsProcessor);
  });

  it('exports AnalyticsProcessor from WorkerModule', () => {
    const exportsList =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, WorkerModule) || [];
    expect(exportsList).toContain(AnalyticsProcessor);
  });

  it('does NOT register AnalyticsProcessor in AnalyticsModule providers', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AnalyticsModule) || [];
    expect(providers).not.toContain(AnalyticsProcessor);
    expect(providers).toContain(AnalyticsService);
  });

  it('does NOT register AnalyticsProcessor in AppModule providers', () => {
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) || [];
    expect(providers).not.toContain(AnalyticsProcessor);
  });

  it('does NOT declare HTTP controllers in WorkerModule', () => {
    const controllers =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, WorkerModule) || [];
    expect(controllers).toEqual([]);
  });
});

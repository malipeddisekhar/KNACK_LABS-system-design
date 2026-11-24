import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { safeHttpMethod, safeRouteTemplate } from '../common/http-route.js';

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const MAX_SERIES = 500;
const TEAM_COUNT_REFRESH_MS = 15_000;

interface HttpSeries {
  method: string;
  path: string;
  status: string;
  count: number;
  sum: number;
  buckets: number[];
}

@Injectable()
export class MetricsService {
  private readonly httpSeries = new Map<string, HttpSeries>();
  private overflowRequests = 0;
  private teamCount: number | undefined;
  private teamCountAvailable = false;
  private lastTeamCountRefresh = 0;

  constructor(private readonly prisma: PrismaService) {}

  recordHttpRequest(
    methodValue: unknown,
    pathValue: unknown,
    statusValue: unknown,
    durationSeconds: number,
  ): void {
    let method = safeHttpMethod(methodValue);
    let path = safeRouteTemplate(pathValue);
    let status =
      typeof statusValue === 'number' &&
      Number.isInteger(statusValue) &&
      statusValue >= 100 &&
      statusValue <= 599
        ? String(statusValue)
        : 'unknown';
    let key = seriesKey(method, path, status);
    if (!this.httpSeries.has(key) && this.httpSeries.size >= MAX_SERIES - 1) {
      method = 'OTHER';
      path = 'other';
      status = 'overflow';
      key = seriesKey(method, path, status);
      this.overflowRequests += 1;
    }
    let series = this.httpSeries.get(key);
    if (!series) {
      series = {
        method,
        path,
        status,
        count: 0,
        sum: 0,
        buckets: BUCKETS.map(() => 0),
      };
      this.httpSeries.set(key, series);
    }

    const duration = Number.isFinite(durationSeconds)
      ? Math.max(0, durationSeconds)
      : 0;
    series.count += 1;
    series.sum += duration;
    BUCKETS.forEach((bound, index) => {
      if (duration <= bound) series!.buckets[index] += 1;
    });
  }

  async renderPrometheus(): Promise<string> {
    await this.refreshTeamCount();
    const lines = [
      '# HELP http_requests_total Completed HTTP requests.',
      '# TYPE http_requests_total counter',
    ];
    const series = [...this.httpSeries.values()].sort(compareSeries);
    for (const item of series) {
      const labels = `method="${escapeLabel(item.method)}",path="${escapeLabel(item.path)}",status="${item.status}"`;
      lines.push(`http_requests_total{${labels}} ${item.count}`);
    }

    lines.push(
      '# HELP http_request_duration_seconds HTTP request duration in seconds.',
      '# TYPE http_request_duration_seconds histogram',
    );
    for (const item of series) {
      const labels = `method="${escapeLabel(item.method)}",path="${escapeLabel(item.path)}",status="${item.status}"`;
      BUCKETS.forEach((bound, index) => {
        lines.push(
          `http_request_duration_seconds_bucket{${labels},le="${bound}"} ${item.buckets[index]}`,
        );
      });
      lines.push(
        `http_request_duration_seconds_bucket{${labels},le="+Inf"} ${item.count}`,
        `http_request_duration_seconds_sum{${labels}} ${formatNumber(item.sum)}`,
        `http_request_duration_seconds_count{${labels}} ${item.count}`,
      );
    }

    lines.push(
      '# HELP http_requests_overflow_total Requests folded into the bounded overflow series.',
      '# TYPE http_requests_overflow_total counter',
      `http_requests_overflow_total ${this.overflowRequests}`,
      '# HELP app_teams_total Number of teams stored in PostgreSQL.',
      '# TYPE app_teams_total gauge',
    );
    if (this.teamCount !== undefined) {
      lines.push(`app_teams_total ${this.teamCount}`);
    }
    lines.push(
      '# HELP app_teams_total_available Whether the team count was refreshed successfully.',
      '# TYPE app_teams_total_available gauge',
      `app_teams_total_available ${this.teamCountAvailable ? 1 : 0}`,
      '# HELP process_uptime_seconds Process uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${formatNumber(process.uptime())}`,
      '# HELP process_resident_memory_bytes Resident memory in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${process.memoryUsage().rss}`,
      '# HELP process_heap_used_bytes JavaScript heap used in bytes.',
      '# TYPE process_heap_used_bytes gauge',
      `process_heap_used_bytes ${process.memoryUsage().heapUsed}`,
      '# HELP process_heap_total_bytes JavaScript heap total in bytes.',
      '# TYPE process_heap_total_bytes gauge',
      `process_heap_total_bytes ${process.memoryUsage().heapTotal}`,
    );
    return `${lines.join('\n')}\n`;
  }

  private async refreshTeamCount(): Promise<void> {
    const now = Date.now();
    if (now - this.lastTeamCountRefresh < TEAM_COUNT_REFRESH_MS) return;
    this.lastTeamCountRefresh = now;
    try {
      const [row] = await this.prisma.$queryRaw<
        Array<{ count: bigint | number }>
      >`SELECT COUNT(*)::bigint AS "count" FROM "teams"`;
      this.teamCount = Number(row?.count ?? 0);
      this.teamCountAvailable = true;
    } catch {
      // Keep the last known value but mark it unavailable; never log DB details.
      this.teamCountAvailable = false;
    }
  }
}

function seriesKey(method: string, path: string, status: string): string {
  return JSON.stringify([method, path, status]);
}

function compareSeries(left: HttpSeries, right: HttpSeries): number {
  return (
    left.method.localeCompare(right.method) ||
    left.path.localeCompare(right.path) ||
    left.status.localeCompare(right.status)
  );
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatNumber(value: number): string {
  return Number(value.toFixed(6)).toString();
}

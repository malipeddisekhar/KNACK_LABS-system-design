import {
  BadRequestException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CacheService } from '../cache/cache.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { CreateLinkDto } from './dto/create-link.dto.js';
import { UpdateLinkDto } from './dto/update-link.dto.js';
import { ListLinksQueryDto } from './dto/list-links-query.dto.js';
import { SearchLinksQueryDto } from './dto/search-links-query.dto.js';
import { normalizeAllowedLongUrl } from './url-policy.js';

const CODE_GENERATION_ATTEMPTS = 3;

export interface LinkResponse {
  id: string;
  code: string;
  short_url: string;
  long_url: string;
  created_at: string;
  tags?: string[];
}

export interface PaginatedLinksResponse {
  items: LinkResponse[];
  page: number;
  limit: number;
  total: number;
}

export interface SearchLinksResponse {
  items: LinkResponse[];
  page: number;
  page_size: number;
  total: number;
}

type LinkForResponse = {
  id: string;
  code: string;
  longUrl: string;
  createdAt: Date;
};

@Injectable()
export class LinksService {
  private readonly publicBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly analyticsService: AnalyticsService,
  ) {
    this.publicBaseUrl = configService
      .getOrThrow<string>('PUBLIC_BASE_URL')
      .replace(/\/+$/, '');
  }

  async create(dto: CreateLinkDto, principalId: string): Promise<LinkResponse> {
    const longUrl = normalizeAllowedLongUrl(dto.long_url);
    if (!longUrl) {
      throw new BadRequestException('long_url must be a valid HTTP or HTTPS URL.');
    }

    const expiresAt = dto.expires_at ? new Date(dto.expires_at) : undefined;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('expires_at must be in the future.');
    }

    for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt += 1) {
      const code = randomBytes(6).toString('base64url');

      try {
        const link = await this.prisma.link.create({
          data: {
            code,
            longUrl,
            principalId,
            tags: dto.tags ?? [],
            ...(expiresAt ? { expiresAt } : {}),
          },
          select: {
            id: true,
            code: true,
            longUrl: true,
            createdAt: true,
          },
        });

        return this.toResponse(link);
      } catch (error) {
        if (this.isPrismaError(error, 'P2002')) {
          if (attempt < CODE_GENERATION_ATTEMPTS - 1) {
            continue;
          }

          throw new ServiceUnavailableException(
            'Unable to allocate a short code right now.',
          );
        }

        throw error;
      }
    }

    throw new ServiceUnavailableException(
      'Unable to allocate a short code right now.',
    );
  }

  async list(
    query: ListLinksQueryDto,
    principalId: string,
  ): Promise<PaginatedLinksResponse> {
    const where = { principalId };
    const skip = (query.page - 1) * query.limit;
    const [links, total] = await Promise.all([
      this.prisma.link.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        select: {
          id: true,
          code: true,
          longUrl: true,
          createdAt: true,
        },
      }),
      this.prisma.link.count({ where }),
    ]);

    return {
      items: links.map((link) => this.toResponse(link)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async search(
    query: SearchLinksQueryDto,
    principalId: string,
  ): Promise<SearchLinksResponse> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.page_size && query.page_size > 0
        ? Math.min(query.page_size, 100)
        : 20;
    const offset = (page - 1) * pageSize;

    // Conditions are strictly parameterized via Prisma.sql to prevent SQL injection
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"principal_id" = ${principalId}`,
    ];

    if (query.q && query.q.trim().length > 0) {
      conditions.push(
        Prisma.sql`to_tsvector('simple', "long_url") @@ plainto_tsquery('simple', ${query.q.trim()})`,
      );
    }

    if (query.tag && query.tag.trim().length > 0) {
      conditions.push(Prisma.sql`${query.tag.trim()} = ANY("tags")`);
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    // Allowlisted dynamic sorting
    let sortColumn = Prisma.sql`"created_at"`;
    if (query.sort_by === 'long_url') {
      sortColumn = Prisma.sql`"long_url"`;
    } else if (query.sort_by === 'code') {
      sortColumn = Prisma.sql`"code"`;
    }

    const sortOrder =
      query.sort_order?.toLowerCase() === 'asc'
        ? Prisma.sql`ASC`
        : Prisma.sql`DESC`;

    const countResult = await this.prisma.$queryRaw<{ count: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int as count FROM "links" ${whereClause}`,
    );
    const total = countResult[0] ? Number(countResult[0].count) : 0;

    const rows = await this.prisma.$queryRaw<{
      id: string;
      code: string;
      long_url: string;
      created_at: Date;
      tags: string[];
    }[]>(
      Prisma.sql`
        SELECT id, code, long_url, created_at, tags
        FROM "links"
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}
        LIMIT ${pageSize}
        OFFSET ${offset}
      `,
    );

    const items: LinkResponse[] = rows.map((row) => ({
      id: row.id,
      code: row.code,
      short_url: `${this.publicBaseUrl}/r/${row.code}`,
      long_url: row.long_url,
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
      tags: row.tags ?? [],
    }));

    return {
      items,
      page,
      page_size: pageSize,
      total,
    };
  }

  async getById(id: string, principalId: string): Promise<LinkResponse> {
    const link = await this.prisma.link.findFirst({
      where: { id, principalId },
      select: {
        id: true,
        code: true,
        longUrl: true,
        createdAt: true,
      },
    });

    if (!link) {
      throw new NotFoundException('Link not found.');
    }

    return this.toResponse(link);
  }

  async update(
    id: string,
    dto: UpdateLinkDto,
    principalId: string,
  ): Promise<LinkResponse> {
    const existing = await this.prisma.link.findFirst({
      where: { id, principalId },
    });

    if (!existing) {
      throw new NotFoundException('Link not found.');
    }

    let longUrl: string | undefined;
    if (dto.long_url !== undefined) {
      const normalized = normalizeAllowedLongUrl(dto.long_url);
      if (!normalized) {
        throw new BadRequestException('long_url must be a valid HTTP or HTTPS URL.');
      }
      longUrl = normalized;
    }

    const updated = await this.prisma.link.update({
      where: { id },
      data: {
        ...(longUrl !== undefined ? { longUrl } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      },
      select: {
        id: true,
        code: true,
        longUrl: true,
        createdAt: true,
      },
    });

    // Invalidate cache entry on update (safe fallback ignores cache errors)
    try {
      await this.cacheService.invalidateRedirectTarget(existing.code);
    } catch {
      // Ignore cache invalidation errors so write succeeds
    }

    return this.toResponse(updated);
  }

  async delete(id: string, principalId: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.link.findFirst({
      where: { id, principalId },
    });

    if (!existing) {
      throw new NotFoundException('Link not found.');
    }

    await this.prisma.clickEvent.deleteMany({ where: { linkId: id } });
    await this.prisma.link.delete({ where: { id } });

    // Invalidate cache entry on delete (safe fallback ignores cache errors)
    try {
      await this.cacheService.invalidateRedirectTarget(existing.code);
    } catch {
      // Ignore cache invalidation errors so deletion succeeds
    }

    return { success: true };
  }

  async getAnalytics(
    id: string,
    principalId: string,
    from?: string,
    to?: string,
  ) {
    const link = await this.prisma.link.findFirst({
      where: { id, principalId },
      select: { id: true },
    });

    if (!link) {
      throw new NotFoundException('Link not found.');
    }

    const clickedAtFilter: { gte?: Date; lte?: Date } = {};
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) {
        clickedAtFilter.gte = fromDate;
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        if (to.length === 10) {
          toDate.setUTCHours(23, 59, 59, 999);
        }
        clickedAtFilter.lte = toDate;
      }
    }

    const where = {
      linkId: id,
      ...(Object.keys(clickedAtFilter).length > 0
        ? { clickedAt: clickedAtFilter }
        : {}),
    };

    const [total, events] = await Promise.all([
      this.prisma.clickEvent.count({ where }),
      this.prisma.clickEvent.findMany({
        where,
        orderBy: { clickedAt: 'desc' },
        select: {
          clickedAt: true,
          userAgent: true,
          referrer: true,
        },
      }),
    ]);

    return {
      link_id: id,
      total_clicks: total,
      last_clicked_at:
        events.length > 0 ? events[0].clickedAt.toISOString() : null,
      events: events.map((event) => ({
        clicked_at: event.clickedAt.toISOString(),
        user_agent: event.userAgent,
        referrer: event.referrer,
      })),
    };
  }

  async getRedirectTarget(
    code: string,
    request: { ip?: string; headers: Record<string, string | string[] | undefined> },
  ): Promise<string> {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(code)) {
      throw new NotFoundException('Short link not found.');
    }

    const userAgent = this.headerValue(request.headers['user-agent']);
    const referrer = this.headerValue(
      request.headers.referer ?? request.headers.referrer,
    );
    const xForwardedFor = request.headers['x-forwarded-for'];
    const clientIp =
      (typeof xForwardedFor === 'string'
        ? xForwardedFor.split(',')[0].trim()
        : Array.isArray(xForwardedFor)
          ? xForwardedFor[0].trim()
          : undefined) ||
      request.ip ||
      'unknown';
    const ipHash = createHash('sha256')
      .update(clientIp)
      .digest('hex');

    // 1. Cache-aside lookup (safe fallback: if Redis fails/unreachable, cachedUrl is null)
    let cachedUrl: string | null = null;
    try {
      cachedUrl = await this.cacheService.getRedirectTarget(code);
    } catch {
      cachedUrl = null;
    }

    if (cachedUrl) {
      let linkId: string | null = null;
      try {
        linkId = await this.cacheService.getRedirectLinkId(code);
      } catch {
        linkId = null;
      }

      if (!linkId) {
        try {
          const dbLink = await this.prisma.link.findUnique({
            where: { code },
            select: { id: true },
          });
          linkId = dbLink?.id ?? null;
        } catch {
          linkId = null;
        }
      }

      if (linkId) {
        await this.analyticsService.recordClick({
          linkId,
          userAgent,
          referrer,
          ipHash,
        });
      }
      return cachedUrl;
    }

    // 2. Cache miss or Redis unavailable -> DB lookup
    let link: { id: string; longUrl: string; expiresAt: Date | null } | null;
    try {
      link = await this.prisma.link.findUnique({
        where: { code },
        select: { id: true, longUrl: true, expiresAt: true },
      });
    } catch {
      throw new InternalServerErrorException(
        'Unable to process this redirect right now.',
      );
    }

    if (!link) {
      throw new NotFoundException('Short link not found.');
    }

    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('This short link has expired.');
    }

    // 3. Populate cache with TTL (graceful fallback: ignores any Redis failure)
    try {
      await this.cacheService.setRedirectTarget(code, link.longUrl, 300, link.id);
    } catch {
      // Ignore cache set failure
    }

    // Record click event asynchronously via queue with durable fallback
    await this.analyticsService.recordClick({
      linkId: link.id,
      userAgent,
      referrer,
      ipHash,
    });

    return link.longUrl;
  }

  private headerValue(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] ?? '' : value ?? '';
  }

  private toResponse(link: LinkForResponse): LinkResponse {
    return {
      id: link.id,
      code: link.code,
      short_url: `${this.publicBaseUrl}/r/${link.code}`,
      long_url: link.longUrl,
      created_at: link.createdAt.toISOString(),
    };
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }
}

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Module 8 Full-Text Search & Pagination (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdIds: string[] = [];

  async function login(username: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password })
      .expect(201);
    return response.body.access_token as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.clickEvent.deleteMany({
        where: { linkId: { in: createdIds } },
      });
      await prisma.link.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
  });

  it('rejects unauthenticated and invalid token search requests with HTTP 401', async () => {
    await request(app.getHttpServer())
      .get('/links/search?q=test')
      .expect(401);

    await request(app.getHttpServer())
      .get('/links/search?q=test')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('searches links by full-text query using to_tsvector and plainto_tsquery', async () => {
    const token = await login('alice', 'alice-development-password');
    const timestamp = Date.now();

    const link1 = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        long_url: `https://microservice-docs.example.com/api-reference/${timestamp}`,
        tags: ['documentation', 'microservice'],
      })
      .expect(201);
    createdIds.push(link1.body.id as string);

    const link2 = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        long_url: `https://analytics-dashboard.example.org/metrics/${timestamp}`,
        tags: ['analytics', 'metrics'],
      })
      .expect(201);
    createdIds.push(link2.body.id as string);

    // 1. Search for host 'microservice-docs.example.com'
    const resMicro = await request(app.getHttpServer())
      .get('/links/search?q=microservice-docs.example.com')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(resMicro.body.page).toBe(1);
    expect(resMicro.body.page_size).toBe(20);
    expect(resMicro.body.total).toBeGreaterThanOrEqual(1);
    const foundMicro = resMicro.body.items.some(
      (item: any) => item.id === link1.body.id,
    );
    expect(foundMicro).toBe(true);

    // 2. Search for host 'analytics-dashboard.example.org'
    const resMetrics = await request(app.getHttpServer())
      .get('/links/search?q=analytics-dashboard.example.org')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const foundMetrics = resMetrics.body.items.some(
      (item: any) => item.id === link2.body.id,
    );
    expect(foundMetrics).toBe(true);

    // 3. Search for a non-existent term
    const resNone = await request(app.getHttpServer())
      .get(`/links/search?q=nonexistentkeyword${timestamp}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(resNone.body.total).toBe(0);
    expect(resNone.body.items).toHaveLength(0);
  });

  it('filters search results by tag and supports combined query+tag filtering', async () => {
    const token = await login('alice', 'alice-development-password');
    const uniqueTag = `customtag-${Date.now()}`;

    const linkA = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        long_url: `https://backend-service.example.com/${Date.now()}`,
        tags: [uniqueTag, 'backend'],
      })
      .expect(201);
    createdIds.push(linkA.body.id as string);

    const linkB = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        long_url: `https://frontend-service.example.com/${Date.now()}`,
        tags: [uniqueTag, 'frontend'],
      })
      .expect(201);
    createdIds.push(linkB.body.id as string);

    // Filter by tag only
    const resTag = await request(app.getHttpServer())
      .get(`/links/search?tag=${uniqueTag}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(resTag.body.total).toBe(2);
    expect(resTag.body.items).toHaveLength(2);

    // Combined filter by tag AND query
    const resCombined = await request(app.getHttpServer())
      .get(`/links/search?tag=${uniqueTag}&q=backend-service.example.com`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(resCombined.body.total).toBe(1);
    expect(resCombined.body.items[0].id).toBe(linkA.body.id);
  });

  it('handles pagination correctly with page and page_size metadata (regression test for off-by-one fix)', async () => {
    const token = await login('alice', 'alice-development-password');
    const pageTag = `pagetest-${Date.now()}`;
    const pageItemIds: string[] = [];

    for (let i = 1; i <= 5; i += 1) {
      const created = await request(app.getHttpServer())
        .post('/links')
        .set('Authorization', `Bearer ${token}`)
        .send({
          long_url: `https://pagination-item-${i}.example.com/${Date.now()}`,
          tags: [pageTag],
        })
        .expect(201);
      createdIds.push(created.body.id as string);
      pageItemIds.push(created.body.id as string);
    }

    // Page 1, page_size 2 with deterministic created_at asc sorting
    const p1 = await request(app.getHttpServer())
      .get(`/links/search?tag=${pageTag}&page=1&page_size=2&sort_by=created_at&sort_order=asc`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(p1.body.page).toBe(1);
    expect(p1.body.page_size).toBe(2);
    expect(p1.body.total).toBe(5);
    expect(p1.body.items).toHaveLength(2);
    // Page 1 starts with the first matching record (no records skipped at beginning)
    expect(p1.body.items[0].id).toBe(pageItemIds[0]);
    expect(p1.body.items[1].id).toBe(pageItemIds[1]);

    // Page 2, page_size 2
    const p2 = await request(app.getHttpServer())
      .get(`/links/search?tag=${pageTag}&page=2&page_size=2&sort_by=created_at&sort_order=asc`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(p2.body.page).toBe(2);
    expect(p2.body.page_size).toBe(2);
    expect(p2.body.total).toBe(5);
    expect(p2.body.items).toHaveLength(2);
    // Page 2 returns the next set of records without overlap
    expect(p2.body.items[0].id).toBe(pageItemIds[2]);
    expect(p2.body.items[1].id).toBe(pageItemIds[3]);

    // Page 3, page_size 2
    const p3 = await request(app.getHttpServer())
      .get(`/links/search?tag=${pageTag}&page=3&page_size=2&sort_by=created_at&sort_order=asc`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(p3.body.page).toBe(3);
    expect(p3.body.page_size).toBe(2);
    expect(p3.body.total).toBe(5);
    expect(p3.body.items).toHaveLength(1);
    expect(p3.body.items[0].id).toBe(pageItemIds[4]);

    // Verify all records are returned across pages without omission or duplicates
    const p1Ids = p1.body.items.map((it: any) => it.id);
    const p2Ids = p2.body.items.map((it: any) => it.id);
    const p3Ids = p3.body.items.map((it: any) => it.id);
    const allFetchedIds = [...p1Ids, ...p2Ids, ...p3Ids];
    expect(allFetchedIds).toEqual(pageItemIds);

    // Verify result set smaller than page_size returns all records on page 1
    const smallTag = `smalltest-${Date.now()}`;
    const smallIds: string[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const created = await request(app.getHttpServer())
        .post('/links')
        .set('Authorization', `Bearer ${token}`)
        .send({
          long_url: `https://small-item-${i}.example.com/${Date.now()}`,
          tags: [smallTag],
        })
        .expect(201);
      createdIds.push(created.body.id as string);
      smallIds.push(created.body.id as string);
    }

    const smallRes = await request(app.getHttpServer())
      .get(`/links/search?tag=${smallTag}&page=1&page_size=20&sort_by=created_at&sort_order=asc`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(smallRes.body.page).toBe(1);
    expect(smallRes.body.page_size).toBe(20);
    expect(smallRes.body.total).toBe(3);
    expect(smallRes.body.items).toHaveLength(3);
    expect(smallRes.body.items.map((it: any) => it.id)).toEqual(smallIds);
  });

  it('enforces page_size limits (1 to 100) and rejects invalid bounds', async () => {
    const token = await login('alice', 'alice-development-password');

    // Accept page_size = 100 (upper boundary)
    const res100 = await request(app.getHttpServer())
      .get('/links/search?page_size=100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res100.body.page_size).toBe(100);

    // Reject page_size > 100 (above boundary)
    await request(app.getHttpServer())
      .get('/links/search?page_size=101')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    // Reject page_size < 1 (below boundary)
    await request(app.getHttpServer())
      .get('/links/search?page_size=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    // Reject non-numeric page
    await request(app.getHttpServer())
      .get('/links/search?page=abc')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('enforces owner-scoped search isolation across distinct principals', async () => {
    const aliceToken = await login('alice', 'alice-development-password');
    const bobToken = await login('bob', 'bob-development-password');
    const isolationKeyword = `isolation-${Date.now()}`;

    const aliceLink = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        long_url: `https://${isolationKeyword}.alice-domain.example.com`,
      })
      .expect(201);
    createdIds.push(aliceLink.body.id as string);

    // Alice searches for her host -> finds 1
    const aliceSearch = await request(app.getHttpServer())
      .get(`/links/search?q=${isolationKeyword}.alice-domain.example.com`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(aliceSearch.body.total).toBe(1);
    expect(aliceSearch.body.items[0].id).toBe(aliceLink.body.id);

    // Bob searches for the exact same host -> finds 0 (ownership isolation)
    const bobSearch = await request(app.getHttpServer())
      .get(`/links/search?q=${isolationKeyword}.alice-domain.example.com`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);
    expect(bobSearch.body.total).toBe(0);
    expect(bobSearch.body.items).toHaveLength(0);
  });

  it('validates dynamic sorting and rejects unauthorized sort fields', async () => {
    const token = await login('alice', 'alice-development-password');

    // Valid allowlisted sorting
    const validSort = await request(app.getHttpServer())
      .get('/links/search?sort_by=created_at&sort_order=desc')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(validSort.body).toHaveProperty('items');

    // Unauthorized sort field rejected with HTTP 400
    await request(app.getHttpServer())
      .get('/links/search?sort_by=unauthorized_field')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});

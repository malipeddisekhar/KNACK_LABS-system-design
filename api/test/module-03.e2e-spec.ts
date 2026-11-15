import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';

describe('Module 3 links and redirects (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'alice', password: 'alice-development-password' })
      .expect(201);
    token = login.body.access_token as string;
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.clickEvent.deleteMany({ where: { linkId: { in: createdIds } } });
      await prisma.link.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
  });

  it('creates a link, lists it, gets it by ID, and redirects with 302', async () => {
    const longUrl = 'https://example.com/module-03?source=test';
    const created = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: `  ${longUrl}  `, tags: ['module-03'] })
      .expect(201);

    expect(created.body).toMatchObject({
      long_url: longUrl,
      short_url: expect.stringMatching(/\/r\/[A-Za-z0-9_-]+$/),
    });
    expect(created.body.id).toEqual(expect.any(String));
    expect(created.body.code).toEqual(expect.any(String));
    expect(created.body.created_at).toEqual(expect.any(String));
    createdIds.push(created.body.id as string);

    await request(app.getHttpServer())
      .get(`/r/${created.body.code as string}`)
      .expect(302)
      .expect('Location', longUrl);

    const listed = await request(app.getHttpServer())
      .get('/links?page=1&limit=20')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.body.id, code: created.body.code }),
      ]),
    );

    const fetched = await request(app.getHttpServer())
      .get(`/links/${created.body.id as string}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(fetched.body.id).toBe(created.body.id);
    expect(fetched.body.long_url).toBe(longUrl);
  });

  it('keeps the health endpoint available', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ ok: true });
  });

  it('accepts a valid HTTP destination as required by the build task', async () => {
    const response = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: 'http://example.org/module-03-http' })
      .expect(201);

    expect(response.body.long_url).toBe('http://example.org/module-03-http');
    createdIds.push(response.body.id as string);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)  ',
    'data:text/html,<svg/onload=alert(1)>',
    '//evil.example.com',
    'http:%2f%2fevil.example.com',
    'http%3A%2F%2Fevil.example.com',
    'http:\\\\evil.example.com',
    'https://good.com@evil.example.com',
    'https://example.com/line\nbreak',
  ])('rejects unsafe destination %j without storing it', async (longUrl) => {
    await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: longUrl })
      .expect(400);

    const stored = await prisma.link.findFirst({ where: { longUrl } });
    expect(stored).toBeNull();
  });

  it('rejects an expiration time that is not in the future', async () => {
    await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        long_url: 'https://example.com/expired-link-test',
        expires_at: '2000-01-01T00:00:00.000Z',
      })
      .expect(400);

    const stored = await prisma.link.findFirst({
      where: { longUrl: 'https://example.com/expired-link-test' },
    });
    expect(stored).toBeNull();
  });

  it('accepts the maximum of 10 tags', async () => {
    const response = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({
        long_url: 'https://example.com/tag-count-valid-test',
        tags: Array(10).fill('tag'),
      })
      .expect(201);

    createdIds.push(response.body.id as string);
  });

  it('rejects 11 tags without storing a record', async () => {
    const longUrl = 'https://example.com/tag-count-invalid-test';

    await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: longUrl, tags: Array(11).fill('tag') })
      .expect(400);

    const stored = await prisma.link.findFirst({ where: { longUrl } });
    expect(stored).toBeNull();
  });

  it('rejects tags beyond the configured length', async () => {
    const longUrl = 'https://example.com/tag-length-test';

    await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: longUrl, tags: ['x'.repeat(33)] })
      .expect(400);

    const stored = await prisma.link.findFirst({ where: { longUrl } });
    expect(stored).toBeNull();
  });

  it('returns a generic not-found response for an unknown short code', async () => {
    const response = await request(app.getHttpServer())
      .get('/r/no-such-code-03')
      .expect(404);
    expect(response.body.message).toBe('Short link not found.');
  });
});

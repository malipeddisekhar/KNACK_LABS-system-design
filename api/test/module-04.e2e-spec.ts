import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { WorkerModule } from './../src/worker.module';
import { PrismaService } from './../src/database/prisma.service';

describe('Module 4 authentication and ownership (e2e)', () => {
  let app: INestApplication<App>;
  let workerApp: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
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
    jwtService = app.get(JwtService);

    const workerFixture: TestingModule = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();
    workerApp = workerFixture.createNestApplication();
    await workerApp.init();
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.clickEvent.deleteMany({ where: { linkId: { in: createdIds } } });
      await prisma.link.deleteMany({ where: { id: { in: createdIds } } });
    }
    if (workerApp) {
      await workerApp.close();
    }
    await app.close();
  });

  it('logs in valid development users with distinct principal IDs', async () => {
    const alice = await login('alice', 'alice-development-password');
    const bob = await login('bob', 'bob-development-password');
    const alicePayload = await jwtService.verifyAsync<{ sub: string }>(alice);
    const bobPayload = await jwtService.verifyAsync<{ sub: string }>(bob);

    expect(alice).toEqual(expect.any(String));
    expect(bob).toEqual(expect.any(String));
    expect(alicePayload.sub).not.toBe(bobPayload.sub);
  });

  it('rejects invalid credentials and invalid or expired JWTs', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'alice', password: 'wrong-password' })
      .expect(401);

    await request(app.getHttpServer())
      .get('/links')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    const expired = await jwtService.signAsync(
      { sub: 'principal-alice', username: 'alice' },
      { expiresIn: '-1s' },
    );
    await request(app.getHttpServer())
      .get('/links')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
  });

  it('enforces ownership isolation while keeping redirects public', async () => {
    const aliceToken = await login('alice', 'alice-development-password');
    const bobToken = await login('bob', 'bob-development-password');
    const longUrl = `https://example.com/module-04?run=${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ long_url: longUrl })
      .expect(201);
    createdIds.push(created.body.id as string);

    await request(app.getHttpServer())
      .get(`/links/${created.body.id as string}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/links/${created.body.id as string}/analytics`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/r/${created.body.code as string}`)
      .expect(302)
      .expect('Location', longUrl);

    let totalClicks = 0;
    for (let i = 0; i < 20; i += 1) {
      const analytics = await request(app.getHttpServer())
        .get(`/links/${created.body.id as string}/analytics`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);
      totalClicks = analytics.body.total_clicks;
      if (totalClicks >= 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(totalClicks).toBe(1);
  });
});

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set.');
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const shortCode = `m2-${Date.now().toString(36)}`;
  const longUrl = 'https://example.com/module-02';

  try {
    const inserted = await prisma.link.create({
      data: {
        code: shortCode,
        longUrl,
        createdBy: 'module-02-seed-query',
      },
      select: {
        code: true,
      },
    });

    const selected = await prisma.link.findUnique({
      where: { code: inserted.code },
      select: {
        code: true,
        longUrl: true,
      },
    });

    if (!selected) {
      throw new Error('Inserted link could not be selected by code.');
    }

    console.log(`Inserted short code: ${inserted.code}`);
    console.log(`Selected short code: ${selected.code}`);
    console.log(`Matched long_url: ${selected.longUrl}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();  
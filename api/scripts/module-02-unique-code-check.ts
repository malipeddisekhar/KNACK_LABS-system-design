import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set.');
}

function getErrorCode(error: unknown): unknown {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return error.code;
  }

  return undefined;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const shortCode = `m2-duplicate-${Date.now().toString(36)}`;
  let duplicateRejected = false;
  let uniqueViolation = false;

  try {
    await prisma.link.create({
      data: {
        code: shortCode,
        longUrl: 'https://example.com/module-02-duplicate-check',
        createdBy: 'module-02-unique-code-check',
      },
    });

    try {
      await prisma.link.create({
        data: {
          code: shortCode,
          longUrl: 'https://example.com/module-02-duplicate-check-second',
          createdBy: 'module-02-unique-code-check',
        },
      });
    } catch (error) {
      const errorCode = getErrorCode(error);

      if (errorCode !== 'P2002') {
        throw error;
      }

      duplicateRejected = true;
      uniqueViolation = true;
    }

    if (!duplicateRejected) {
      throw new Error('Duplicate insert was not rejected.');
    }

    console.log(`Duplicate insert rejected: ${duplicateRejected}`);
    console.log(`Unique-constraint violation: ${uniqueViolation} (P2002)`);
  } finally {
    const deleted = await prisma.link.deleteMany({
      where: { code: shortCode },
    });

    console.log(`Deleted test records: ${deleted.count}`);
    await prisma.$disconnect();
  }
}

void main();
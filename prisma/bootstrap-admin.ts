/* eslint-disable no-console */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { isEmail } from 'class-validator';

const SALT_ROUNDS = 10;

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function validateAdminInput(name: string, email: string, password: string): void {
  if (name.length < 2 || name.length > 100) {
    throw new Error('ADMIN_NAME must contain between 2 and 100 characters');
  }

  if (email.length > 254 || !isEmail(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address');
  }

  if (password.length < 8 || password.length > 128) {
    throw new Error('ADMIN_PASSWORD must contain between 8 and 128 characters');
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('ADMIN_PASSWORD must contain at least one letter and one number');
  }
}

async function bootstrapAdmin(): Promise<void> {
  const databaseUrl = getRequiredEnvironmentVariable('DATABASE_URL').trim();
  const name = getRequiredEnvironmentVariable('ADMIN_NAME').trim();
  const email = getRequiredEnvironmentVariable('ADMIN_EMAIL').trim().toLowerCase();
  const password = getRequiredEnvironmentVariable('ADMIN_PASSWORD');

  validateAdminInput(name, email, password);

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN', deleted_at: null },
      select: { email: true },
    });

    if (existingAdmin) {
      console.log(
        `An active administrator already exists (${existingAdmin.email}). Bootstrap skipped.`,
      );
      return;
    }

    const existingUser = await prisma.user.findFirst({
      where: { email, deleted_at: null },
      select: { role: true },
    });

    if (existingUser) {
      throw new Error(`An active ${existingUser.role} user already uses ADMIN_EMAIL`);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'ADMIN',
      },
    });

    console.log(`Initial administrator created successfully (${email}).`);
  } finally {
    await prisma.$disconnect();
  }
}

bootstrapAdmin().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Administrator bootstrap failed: ${message}`);
  process.exitCode = 1;
});

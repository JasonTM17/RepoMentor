import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { ARGON2ID_OPTIONS } from "../modules/auth/password-hasher.service.js";
import { hash } from "argon2";

const SEED_USER_ENV_NAMES = [
  "SEED_USER_EMAIL",
  "SEED_USER_PASSWORD",
  "SEED_USER_DISPLAY_NAME",
] as const;

const seedUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z
    .string()
    .min(12)
    .max(128)
    .refine((value) => value.trim().length > 0),
  displayName: z.string().trim().min(1).max(80),
});

export interface SeedUserConfig {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

export class SeedConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedConfigurationError";
  }
}

function isProduction(environment: NodeJS.ProcessEnv): boolean {
  return environment.NODE_ENV?.trim().toLowerCase() === "production";
}

export function parseSeedUserConfig(environment: NodeJS.ProcessEnv = process.env): SeedUserConfig {
  if (isProduction(environment)) {
    throw new SeedConfigurationError("The development seed is disabled in production.");
  }

  const missingVariables = SEED_USER_ENV_NAMES.filter((name) => {
    const value = environment[name];
    return value === undefined || value.trim() === "";
  });

  if (missingVariables.length > 0) {
    throw new SeedConfigurationError(
      `Missing required seed environment variables: ${missingVariables.join(", ")}.`,
    );
  }

  const result = seedUserSchema.safeParse({
    displayName: environment.SEED_USER_DISPLAY_NAME,
    email: environment.SEED_USER_EMAIL,
    password: environment.SEED_USER_PASSWORD,
  });

  if (!result.success) {
    throw new SeedConfigurationError("Seed user values are outside the allowed bounds.");
  }

  return result.data;
}

export async function seedDevelopmentUser(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const user = parseSeedUserConfig(environment);
  const passwordHash = await hash(user.password, ARGON2ID_OPTIONS);
  const prisma = new PrismaClient();

  try {
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        displayName: user.displayName,
        email: user.email,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
      },
      update: {
        displayName: user.displayName,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
      },
      select: { id: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

function isMainModule(): boolean {
  const entryPath = process.argv[1];
  return entryPath !== undefined && resolve(entryPath) === fileURLToPath(import.meta.url);
}

async function main(): Promise<void> {
  try {
    await seedDevelopmentUser();
    console.log("Development database seed completed.");
  } catch (error: unknown) {
    if (error instanceof SeedConfigurationError) {
      console.error(error.message);
    } else {
      console.error("Development database seed failed.");
    }

    process.exitCode = 1;
  }
}

if (isMainModule()) {
  void main();
}

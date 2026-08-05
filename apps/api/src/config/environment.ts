import { z } from "zod";

const DEFAULT_PORT = 3000;
const MIN_PORT = 1;
const MAX_PORT = 65_535;
const NODE_ENV_VALUES = ["development", "test", "production"] as const;

const environmentSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES).default("development"),
  APP_PORT: z.string().optional(),
  PORT: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
});

const portSchema = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform(Number)
  .refine((value) => value >= MIN_PORT && value <= MAX_PORT);

const urlSchema = z.string().trim().min(1).url();

export type NodeEnvironment = (typeof NODE_ENV_VALUES)[number];

export interface EnvironmentConfig {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly databaseUrl?: string;
  readonly redisUrl?: string;
}

export class EnvironmentConfigError extends Error {
  readonly variableNames: readonly string[];

  constructor(variableNames: Iterable<string>) {
    const names = [...new Set(variableNames)].sort();

    super(`Invalid environment configuration: ${names.join(", ")}`);
    this.name = "EnvironmentConfigError";
    this.variableNames = names;
  }
}

function addIssueVariables(
  invalidVariables: Set<string>,
  issues: readonly { path: readonly PropertyKey[] }[],
): void {
  for (const issue of issues) {
    const variableName = issue.path[0];

    if (typeof variableName === "string") {
      invalidVariables.add(variableName);
    }
  }
}

function parsePort(
  variableName: "APP_PORT" | "PORT",
  rawValue: unknown,
  invalidVariables: Set<string>,
): number | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  const result = portSchema.safeParse(rawValue);

  if (!result.success) {
    invalidVariables.add(variableName);
    return undefined;
  }

  return result.data;
}

function parseUrl(
  variableName: "DATABASE_URL" | "REDIS_URL",
  rawValue: unknown,
  required: boolean,
  invalidVariables: Set<string>,
): string | undefined {
  if (rawValue === undefined) {
    if (required) {
      invalidVariables.add(variableName);
    }

    return undefined;
  }

  if (typeof rawValue !== "string") {
    invalidVariables.add(variableName);
    return undefined;
  }

  if (rawValue.trim() === "") {
    if (required) {
      invalidVariables.add(variableName);
    }

    return undefined;
  }

  const result = urlSchema.safeParse(rawValue);

  if (!result.success) {
    invalidVariables.add(variableName);
    return undefined;
  }

  return result.data;
}

export function parseEnvironment(environment: NodeJS.ProcessEnv = process.env): EnvironmentConfig {
  const parsedEnvironment = environmentSchema.safeParse(environment);
  const invalidVariables = new Set<string>();

  if (!parsedEnvironment.success) {
    addIssueVariables(invalidVariables, parsedEnvironment.error.issues);
  }

  const nodeEnv = parsedEnvironment.success
    ? parsedEnvironment.data.NODE_ENV
    : environment.NODE_ENV === "test"
      ? "test"
      : undefined;

  const appPort = parsePort("APP_PORT", environment.APP_PORT, invalidVariables);
  const legacyPort = parsePort("PORT", environment.PORT, invalidVariables);
  const databaseUrl = parseUrl(
    "DATABASE_URL",
    environment.DATABASE_URL,
    nodeEnv !== "test",
    invalidVariables,
  );
  const redisUrl = parseUrl(
    "REDIS_URL",
    environment.REDIS_URL,
    nodeEnv !== "test",
    invalidVariables,
  );

  if (invalidVariables.size > 0 || !nodeEnv) {
    if (!nodeEnv) {
      invalidVariables.add("NODE_ENV");
    }

    throw new EnvironmentConfigError(invalidVariables);
  }

  return {
    nodeEnv,
    port: appPort ?? legacyPort ?? DEFAULT_PORT,
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(redisUrl ? { redisUrl } : {}),
  };
}

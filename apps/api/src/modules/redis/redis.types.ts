import type { RedisOperation } from "./redis.errors.js";

export const REDIS_COMMAND_EXECUTOR = Symbol("REDIS_COMMAND_EXECUTOR");

export interface RedisEvalOptions {
  readonly keys: readonly string[];
  readonly arguments: readonly string[];
}

export interface RedisSetOptions {
  readonly NX: true;
  readonly PX: number;
}

export interface RedisCommandExecutor {
  eval(script: string, options: RedisEvalOptions, operation: RedisOperation): Promise<unknown>;
  set(
    key: string,
    value: string,
    options: RedisSetOptions,
    operation: RedisOperation,
  ): Promise<"OK" | null>;
}

export interface RedisClientLike {
  readonly isOpen: boolean;
  readonly isReady: boolean;
  connect(): Promise<void>;
  on(event: "error", listener: (error: unknown) => void): unknown;
  eval(script: string, options: RedisEvalOptions): Promise<unknown>;
  set(key: string, value: string, options: RedisSetOptions): Promise<"OK" | null>;
}

export type RedisClientFactory = (url: string) => RedisClientLike;

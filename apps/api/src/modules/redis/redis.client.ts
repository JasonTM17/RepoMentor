import { createClient } from "redis";

import {
  RedisCommandError,
  RedisConfigurationError,
  RedisUnavailableError,
  type RedisOperation,
} from "./redis.errors.js";
import type {
  RedisClientFactory,
  RedisClientLike,
  RedisCommandExecutor,
  RedisEvalOptions,
  RedisSetOptions,
} from "./redis.types.js";

const REDIS_URL_PROTOCOLS = new Set(["redis:", "rediss:"]);

export const REDIS_CONNECT_TIMEOUT_MS = 1_000;
export const REDIS_COMMAND_TIMEOUT_MS = 1_000;

export function assertRedisUrl(value: string): void {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new RedisConfigurationError("REDIS_URL");
  }

  if (!REDIS_URL_PROTOCOLS.has(parsed.protocol) || parsed.hostname.length === 0) {
    throw new RedisConfigurationError("REDIS_URL");
  }
}

export function getRedisClientOptions(url: string) {
  return {
    url,
    disableOfflineQueue: true,
    socket: {
      reconnectStrategy: false,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    },
  } as const;
}

function createDefaultClient(url: string): RedisClientLike {
  const client = createClient(getRedisClientOptions(url)) as unknown as RedisClientLike;

  // node-redis requires an error listener. Never log the underlying error because
  // connection errors can contain URLs, usernames, or other deployment details.
  client.on("error", () => undefined);

  return client;
}

function asUnavailable(error: unknown, operation: RedisOperation): RedisUnavailableError {
  if (error instanceof RedisUnavailableError && error.operation === operation) {
    return error;
  }

  return new RedisUnavailableError(operation);
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: RedisOperation,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RedisUnavailableError(operation));
    }, timeoutMs);
    timer.unref();
  });

  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

export class RedisClientAdapter implements RedisCommandExecutor {
  private client: RedisClientLike | undefined;
  private connectPromise: Promise<void> | undefined;

  constructor(
    private readonly redisUrl: string,
    private readonly clientFactory: RedisClientFactory = createDefaultClient,
  ) {
    assertRedisUrl(redisUrl);
  }

  private async getReadyClient(operation: RedisOperation): Promise<RedisClientLike> {
    if (this.client === undefined) {
      try {
        this.client = this.clientFactory(this.redisUrl);
      } catch {
        throw new RedisUnavailableError(operation);
      }
    }

    const client = this.client;

    if (client.isOpen) {
      if (!client.isReady) {
        throw new RedisUnavailableError(operation);
      }

      return client;
    }

    if (this.connectPromise === undefined) {
      try {
        this.connectPromise = withDeadline(
          client.connect(),
          REDIS_CONNECT_TIMEOUT_MS,
          operation,
        ).finally(() => {
          this.connectPromise = undefined;
        });
      } catch {
        throw new RedisUnavailableError(operation);
      }
    }

    const connectPromise = this.connectPromise;

    if (connectPromise === undefined) {
      throw new RedisUnavailableError(operation);
    }

    try {
      await connectPromise;
    } catch (error) {
      throw asUnavailable(error, operation);
    }

    if (!client.isOpen || !client.isReady) {
      throw new RedisUnavailableError(operation);
    }

    return client;
  }

  async eval(
    script: string,
    options: RedisEvalOptions,
    operation: RedisOperation,
  ): Promise<unknown> {
    try {
      const client = await this.getReadyClient(operation);
      const result = client.eval(script, {
        keys: [...options.keys],
        arguments: [...options.arguments],
      });

      return await withDeadline(result, REDIS_COMMAND_TIMEOUT_MS, operation);
    } catch (error) {
      if (error instanceof RedisCommandError) {
        throw error;
      }

      throw asUnavailable(error, operation);
    }
  }

  async set(
    key: string,
    value: string,
    options: RedisSetOptions,
    operation: RedisOperation,
  ): Promise<"OK" | null> {
    try {
      const client = await this.getReadyClient(operation);
      const result = await withDeadline(
        client.set(key, value, options),
        REDIS_COMMAND_TIMEOUT_MS,
        operation,
      );

      if (result !== "OK" && result !== null) {
        throw new RedisCommandError(operation);
      }

      return result;
    } catch (error) {
      if (error instanceof RedisCommandError) {
        throw error;
      }

      throw asUnavailable(error, operation);
    }
  }
}

export function createRedisClientAdapter(
  redisUrl: string,
  clientFactory?: RedisClientFactory,
): RedisClientAdapter {
  return new RedisClientAdapter(redisUrl, clientFactory);
}

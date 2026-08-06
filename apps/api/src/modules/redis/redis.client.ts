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

function createDefaultClient(url: string): RedisClientLike {
  const client = createClient({ url }) as unknown as RedisClientLike;

  // node-redis requires an error listener. Never log the underlying error because
  // connection errors can contain URLs, usernames, or other deployment details.
  client.on("error", () => undefined);

  return client;
}

function asUnavailable(error: unknown, operation: RedisOperation): Error {
  if (error instanceof RedisUnavailableError) {
    return error;
  }

  return new RedisUnavailableError(operation);
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

  private async getConnectedClient(): Promise<RedisClientLike> {
    if (this.client === undefined) {
      try {
        this.client = this.clientFactory(this.redisUrl);
      } catch {
        throw new RedisUnavailableError("connect");
      }
    }

    if (this.client.isOpen) {
      return this.client;
    }

    if (this.connectPromise === undefined) {
      try {
        this.connectPromise = this.client.connect().finally(() => {
          this.connectPromise = undefined;
        });
      } catch {
        throw new RedisUnavailableError("connect");
      }
    }

    try {
      await this.connectPromise;
    } catch {
      throw new RedisUnavailableError("connect");
    }

    return this.client;
  }

  async eval(script: string, options: RedisEvalOptions): Promise<unknown> {
    try {
      const client = await this.getConnectedClient();

      return await client.eval(script, {
        keys: [...options.keys],
        arguments: [...options.arguments],
      });
    } catch (error) {
      if (error instanceof RedisCommandError) {
        throw error;
      }

      throw asUnavailable(error, "command");
    }
  }

  async set(key: string, value: string, options: RedisSetOptions): Promise<"OK" | null> {
    try {
      const client = await this.getConnectedClient();
      const result = await client.set(key, value, options);

      if (result !== "OK" && result !== null) {
        throw new RedisCommandError("command");
      }

      return result;
    } catch (error) {
      if (error instanceof RedisCommandError) {
        throw error;
      }

      throw asUnavailable(error, "command");
    }
  }
}

export function createRedisClientAdapter(
  redisUrl: string,
  clientFactory?: RedisClientFactory,
): RedisClientAdapter {
  return new RedisClientAdapter(redisUrl, clientFactory);
}

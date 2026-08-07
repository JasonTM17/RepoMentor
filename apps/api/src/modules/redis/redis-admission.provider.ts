import { createRedisClientAdapter } from "./redis.client.js";
import { RedisUnavailableError } from "./redis.errors.js";
import type { RedisCommandExecutor } from "./redis.types.js";

export function createUnavailableRedisExecutor(): RedisCommandExecutor {
  return {
    eval: async (_script, _options, operation) => {
      throw new RedisUnavailableError(operation);
    },
    set: async (_key, _value, _options, operation) => {
      throw new RedisUnavailableError(operation);
    },
  };
}

export function createUsageRedisExecutor(
  environment: NodeJS.ProcessEnv = process.env,
): RedisCommandExecutor {
  const redisUrl = environment.REDIS_URL?.trim();

  return redisUrl ? createRedisClientAdapter(redisUrl) : createUnavailableRedisExecutor();
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MODULE_METADATA } from "@nestjs/common/constants.js";

import { createUsageRedisExecutor } from "../../src/modules/redis/redis-admission.provider.js";
import { REDIS_COMMAND_EXECUTOR } from "../../src/modules/redis/redis.types.js";
import { QUOTA_ADMISSION_REDIS_EXECUTOR } from "../../src/modules/usage/quota-admission-http.service.js";
import { UsageModule } from "../../src/modules/usage/usage.module.js";
import { USAGE_REDIS_CONFIG } from "../../src/modules/usage/usage.config.js";

describe("shared Redis module wiring", () => {
  it("exports one executor/config seam while preserving the quota alias", () => {
    assert.equal(QUOTA_ADMISSION_REDIS_EXECUTOR, REDIS_COMMAND_EXECUTOR);

    const exportedProviders = Reflect.getMetadata(MODULE_METADATA.EXPORTS, UsageModule) as
      readonly unknown[] | undefined;
    const declaredProviders = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, UsageModule) as
      readonly unknown[] | undefined;
    const executorProviders = declaredProviders?.filter(
      (provider): provider is { provide: unknown; useFactory: unknown } =>
        typeof provider === "object" &&
        provider !== null &&
        "provide" in provider &&
        "useFactory" in provider &&
        provider.provide === REDIS_COMMAND_EXECUTOR,
    );

    assert.ok(exportedProviders?.includes(REDIS_COMMAND_EXECUTOR));
    assert.ok(exportedProviders?.includes(USAGE_REDIS_CONFIG));
    assert.equal(executorProviders?.length, 1);
    assert.equal(executorProviders?.[0]?.useFactory, createUsageRedisExecutor);
  });
});

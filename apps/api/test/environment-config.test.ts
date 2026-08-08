import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_CORS_ORIGINS,
  EnvironmentConfigError,
  parseEnvironment,
} from "../src/config/environment.js";

function expectEnvironmentError(
  environment: NodeJS.ProcessEnv,
  expectedVariables: readonly string[],
  forbiddenValues: readonly string[] = [],
): void {
  assert.throws(
    () => parseEnvironment(environment),
    (error: unknown) => {
      assert.ok(error instanceof EnvironmentConfigError);
      assert.deepEqual(error.variableNames, expectedVariables);

      for (const forbiddenValue of forbiddenValues) {
        assert.equal(error.message.includes(forbiddenValue), false);
      }

      return true;
    },
  );
}

describe("environment configuration", () => {
  it("accepts test fixtures without live service URLs", () => {
    assert.deepEqual(parseEnvironment({ NODE_ENV: "test", APP_PORT: "3100" }), {
      corsOrigins: DEFAULT_CORS_ORIGINS,
      nodeEnv: "test",
      port: 3100,
    });
  });

  it("uses PORT when APP_PORT is not provided", () => {
    assert.equal(parseEnvironment({ NODE_ENV: "test", PORT: "3200" }).port, 3200);
  });

  it("requires database and redis URLs outside test runtime", () => {
    expectEnvironmentError({ NODE_ENV: "development", APP_PORT: "3000" }, [
      "DATABASE_URL",
      "REDIS_URL",
    ]);
  });

  it("rejects invalid runtime variables without echoing raw values", () => {
    const databaseUrl = "postgresql://localhost:5432/repomentor";
    const redisUrl = "not-a-redis-url";

    expectEnvironmentError(
      {
        NODE_ENV: "production",
        APP_PORT: "3000",
        CORS_ORIGINS: "https://web.example",
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
      },
      ["REDIS_URL"],
      [databaseUrl, redisUrl],
    );
  });

  it("rejects unsupported node environments", () => {
    expectEnvironmentError(
      {
        NODE_ENV: "staging",
        APP_PORT: "3000",
        DATABASE_URL: "postgresql://localhost:5432/repomentor",
        REDIS_URL: "redis://localhost:6379",
      },
      ["NODE_ENV"],
      ["staging"],
    );
  });

  it("enforces inclusive port bounds", () => {
    const validEnvironment = {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://localhost:5432/repomentor",
      REDIS_URL: "redis://localhost:6379",
    };

    assert.equal(parseEnvironment({ ...validEnvironment, APP_PORT: "1" }).port, 1);
    assert.equal(parseEnvironment({ ...validEnvironment, APP_PORT: "65535" }).port, 65535);

    for (const invalidPort of ["0", "65536", "3000.5", "not-a-port"]) {
      expectEnvironmentError(
        { ...validEnvironment, APP_PORT: invalidPort },
        ["APP_PORT"],
        [invalidPort],
      );
    }
  });

  it("normalizes and de-duplicates explicit CORS origins", () => {
    const config = parseEnvironment({
      NODE_ENV: "test",
      CORS_ORIGINS: " https://Web.Example.com/ , http://localhost:3000,https://web.example.com ",
    });

    assert.deepEqual(config.corsOrigins, ["https://web.example.com", "http://localhost:3000"]);
  });

  it("requires a non-wildcard production CORS allowlist without echoing raw origins", () => {
    const baseEnvironment = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost:5432/repomentor",
      REDIS_URL: "redis://localhost:6379",
    };

    expectEnvironmentError({ ...baseEnvironment }, ["CORS_ORIGINS"]);
    expectEnvironmentError({ ...baseEnvironment, CORS_ORIGINS: "*" }, ["CORS_ORIGINS"], [
      "*",
    ] as const);

    const invalidOrigin = "https://evil.example/path";
    expectEnvironmentError(
      { ...baseEnvironment, CORS_ORIGINS: invalidOrigin },
      ["CORS_ORIGINS"],
      [invalidOrigin],
    );
  });
});

import { createHash } from "node:crypto";

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import type { CanActivate, ExecutionContext } from "@nestjs/common";

export type AuthRateLimitScope = "register" | "login" | "refresh";

export const AUTH_RATE_LIMIT_SCOPE = Symbol("AUTH_RATE_LIMIT_SCOPE");
export const AUTH_RATE_LIMIT_POLICIES = Symbol("AUTH_RATE_LIMIT_POLICIES");

export const authRateLimit = (scope: AuthRateLimitScope) =>
  SetMetadata(AUTH_RATE_LIMIT_SCOPE, scope);

export interface AuthRateLimitPolicy {
  readonly limit: number;
  readonly windowMs: number;
}

export type AuthRateLimitPolicies = Readonly<Record<AuthRateLimitScope, AuthRateLimitPolicy>>;

export const DEFAULT_AUTH_RATE_LIMIT_POLICIES: AuthRateLimitPolicies = {
  login: { limit: 5, windowMs: 5 * 60 * 1000 },
  refresh: { limit: 30, windowMs: 60 * 1000 },
  register: { limit: 5, windowMs: 15 * 60 * 1000 },
};

export const MAX_AUTH_RATE_LIMIT_BUCKETS = 10_000;

interface RateLimitBucket {
  count: number;
  windowStartedAt: number;
}

export interface AuthRateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

function hashKey(scope: AuthRateLimitScope, identifier: string): string {
  return createHash("sha256").update(`${scope}:${identifier}`, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRequestIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function getRequestEmail(request: Request): string | undefined {
  if (!isRecord(request.body) || typeof request.body.email !== "string") {
    return undefined;
  }

  const email = request.body.email.trim().toLowerCase();
  return email || undefined;
}

@Injectable()
export class AuthRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly policies: AuthRateLimitPolicies;

  constructor(
    @Optional()
    @Inject(AUTH_RATE_LIMIT_POLICIES)
    policies?: AuthRateLimitPolicies,
  ) {
    this.policies = policies ?? DEFAULT_AUTH_RATE_LIMIT_POLICIES;
  }

  consume(
    scope: AuthRateLimitScope,
    identifiers: readonly string[],
    now = Date.now(),
  ): AuthRateLimitDecision {
    const policy = this.policies[scope];
    const keys = [...new Set(identifiers.filter((identifier) => identifier.length > 0))].map(
      (identifier) => hashKey(scope, identifier),
    );
    const effectiveKeys = keys.length > 0 ? keys : [hashKey(scope, "anonymous")];
    const buckets = effectiveKeys.map((key) => this.getBucket(key, policy, now));
    const blockedBucket = buckets.find((bucket) => bucket.count >= policy.limit);

    if (blockedBucket) {
      return {
        allowed: false,
        limit: policy.limit,
        remaining: 0,
        retryAfterSeconds: this.retryAfterSeconds(blockedBucket, policy, now),
      };
    }

    for (const bucket of buckets) {
      bucket.count += 1;
    }

    this.trim(now);

    return {
      allowed: true,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - Math.max(...buckets.map((bucket) => bucket.count))),
      retryAfterSeconds: 0,
    };
  }

  clear(): void {
    this.buckets.clear();
  }

  get size(): number {
    return this.buckets.size;
  }

  private getBucket(key: string, policy: AuthRateLimitPolicy, now: number): RateLimitBucket {
    const existing = this.buckets.get(key);

    if (existing && now - existing.windowStartedAt < policy.windowMs) {
      return existing;
    }

    if (this.buckets.size >= MAX_AUTH_RATE_LIMIT_BUCKETS) {
      this.trim(now);
    }

    const bucket = { count: 0, windowStartedAt: now };
    this.buckets.set(key, bucket);
    return bucket;
  }

  private trim(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStartedAt >= 15 * 60 * 1000) {
        this.buckets.delete(key);
      }
    }

    while (this.buckets.size > MAX_AUTH_RATE_LIMIT_BUCKETS) {
      const oldestKey = this.buckets.keys().next().value;

      if (oldestKey === undefined) {
        break;
      }

      this.buckets.delete(oldestKey);
    }
  }

  private retryAfterSeconds(
    bucket: RateLimitBucket,
    policy: AuthRateLimitPolicy,
    now: number,
  ): number {
    return Math.max(1, Math.ceil((bucket.windowStartedAt + policy.windowMs - now) / 1000));
  }
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: AuthRateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const scope = this.reflector.get<AuthRateLimitScope>(
      AUTH_RATE_LIMIT_SCOPE,
      context.getHandler(),
    );

    if (!scope) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const identifiers = [`ip:${getRequestIp(request)}`];
    const email = getRequestEmail(request);

    if (scope !== "refresh" && email) {
      identifiers.push(`email:${email}`);
    }

    const decision = this.limiter.consume(scope, identifiers);
    response.setHeader("X-RateLimit-Limit", decision.limit);
    response.setHeader("X-RateLimit-Remaining", decision.remaining);

    if (!decision.allowed) {
      response.setHeader("Retry-After", decision.retryAfterSeconds);
      throw new HttpException({}, HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}

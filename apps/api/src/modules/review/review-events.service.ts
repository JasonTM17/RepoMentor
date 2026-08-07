import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  REVIEW_EVENT_SCHEMA_VERSION,
  reviewEventSchema,
  type ReviewEvent,
} from "@repomentor/contracts";
import type { Response } from "express";

import { AUTH_REPOSITORY } from "../auth/auth.types.js";
import type { AuthRepository } from "../auth/auth.types.js";
import { RedisUnavailableError } from "../redis/redis.errors.js";
import { acquireReviewStreamLease, releaseReviewStreamLease } from "../redis/redis.stream.js";
import { REDIS_COMMAND_EXECUTOR, type RedisCommandExecutor } from "../redis/redis.types.js";
import {
  REVIEW_MAX_EVENT_SEQUENCE,
  REVIEW_REPOSITORY,
  type ReviewEventRecord,
  type ReviewRepository,
} from "./review.types.js";

export const REVIEW_EVENT_STREAM_MAX_REPLAY = 64;
export const REVIEW_EVENT_STREAM_MAX_PAYLOAD_BYTES = 16_384;

const DEFAULT_STREAM_CONFIG = {
  heartbeatIntervalMs: 15_000,
  maxLifetimeMs: 120_000,
  pollIntervalMs: 1_000,
} as const;

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export interface ReviewEventStreamConfig {
  readonly heartbeatIntervalMs?: number;
  readonly maxLifetimeMs?: number;
  readonly pollIntervalMs?: number;
}

export interface ReviewEventStreamInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly reviewId: string;
  readonly lastEventId?: string | undefined;
  readonly response: Response;
}

type ParsedCursor =
  | { readonly kind: "ABSENT" }
  | { readonly kind: "INVALID" }
  | { readonly kind: "VALID"; readonly sequence: number };

interface InitialDelivery {
  readonly deliveredSequence: number;
  readonly events: readonly ReviewEvent[];
}

interface ReviewStreamLease {
  readonly kind: "local" | "redis";
  readonly reviewId: string;
  readonly token: string;
}

function boundedConfigValue(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isSafeInteger(value) && value !== undefined && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

function isTerminal(status: ReviewEventRecord["status"]): boolean {
  return TERMINAL_STATUSES.has(status);
}

function parseCursor(value: string | undefined): ParsedCursor {
  if (value === undefined || value.trim() === "") {
    return { kind: "ABSENT" };
  }

  const normalized = value.trim();

  if (!/^[1-9][0-9]{0,9}$/u.test(normalized)) {
    return { kind: "INVALID" };
  }

  const sequence = Number(normalized);

  return sequence > 0 && sequence <= REVIEW_MAX_EVENT_SEQUENCE
    ? { kind: "VALID", sequence }
    : { kind: "INVALID" };
}

function isContiguous(events: readonly ReviewEventRecord[], firstSequence: number): boolean {
  return events.every((event, index) => event.sequence === firstSequence + index);
}

function baseEvent(record: ReviewEventRecord) {
  return {
    generation: record.generation,
    id: String(record.sequence),
    resultAvailable: record.resultAvailable,
    reviewId: record.reviewId,
    schemaVersion: REVIEW_EVENT_SCHEMA_VERSION,
    status: record.status,
  } as const;
}

function toEvent(record: ReviewEventRecord): ReviewEvent {
  const base = baseEvent(record);

  switch (record.type) {
    case "COMPLETED":
      return reviewEventSchema.parse({ ...base, resultAvailable: true, type: "completed" });
    case "FAILED":
      return reviewEventSchema.parse({
        ...base,
        resultAvailable: false,
        retryable: record.retryable ?? false,
        type: "failed",
      });
    case "CANCELLED":
      return reviewEventSchema.parse({ ...base, resultAvailable: false, type: "cancelled" });
    case "SNAPSHOT":
      return reviewEventSchema.parse({
        ...base,
        ...(record.retryable === null ? {} : { retryable: record.retryable }),
        replay: "current",
        type: "snapshot",
      });
  }
}

function toResetSnapshot(record: ReviewEventRecord): ReviewEvent {
  return reviewEventSchema.parse({
    ...baseEvent(record),
    ...(record.retryable === null ? {} : { retryable: record.retryable }),
    replay: "reset",
    type: "snapshot",
  });
}

function toHeartbeat(record: ReviewEventRecord): ReviewEvent {
  // Heartbeats reuse the latest durable lifecycle ID; they never allocate an
  // in-memory cursor that could be lost on restart or differ across instances.
  return reviewEventSchema.parse({ ...baseEvent(record), type: "heartbeat" });
}

@Injectable()
export class ReviewEventStreamService {
  private readonly config: Required<ReviewEventStreamConfig>;
  private readonly localLeases = new Map<string, string>();

  constructor(
    @Inject(REVIEW_REPOSITORY) private readonly repository: ReviewRepository,
    @Optional() streamConfig?: ReviewEventStreamConfig,
    @Optional() @Inject(AUTH_REPOSITORY) private readonly authRepository?: AuthRepository,
    @Optional()
    @Inject(REDIS_COMMAND_EXECUTOR)
    private readonly redisExecutor?: RedisCommandExecutor,
  ) {
    this.config = {
      heartbeatIntervalMs: boundedConfigValue(
        streamConfig?.heartbeatIntervalMs,
        DEFAULT_STREAM_CONFIG.heartbeatIntervalMs,
        120_000,
      ),
      maxLifetimeMs: boundedConfigValue(
        streamConfig?.maxLifetimeMs,
        DEFAULT_STREAM_CONFIG.maxLifetimeMs,
        120_000,
      ),
      pollIntervalMs: boundedConfigValue(
        streamConfig?.pollIntervalMs,
        DEFAULT_STREAM_CONFIG.pollIntervalMs,
        60_000,
      ),
    };
  }

  async stream(input: ReviewEventStreamInput): Promise<void> {
    if (!(await this.isSessionActive(input.userId, input.sessionId))) {
      throw new UnauthorizedException();
    }

    const review = await this.repository.findByIdForUser(input.userId, input.reviewId);

    if (!review) {
      throw new NotFoundException();
    }

    const latest = await this.repository.latestEventForUser(input.userId, input.reviewId);

    if (!latest) {
      throw new ServiceUnavailableException();
    }

    const initial = await this.resolveInitialDelivery(
      input.userId,
      input.reviewId,
      parseCursor(input.lastEventId),
      latest,
    );
    const lease = await this.acquireLease(input.reviewId);
    const response = input.response;

    response.status(HttpStatus.OK);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();

    return new Promise<void>((resolve) => {
      let deliveredSequence = initial.deliveredSequence;
      let finished = false;
      let heartbeatAt = Date.now();
      let pollTimer: ReturnType<typeof setTimeout> | undefined;
      let lifetimeTimer: ReturnType<typeof setTimeout> | undefined;

      const onClose = (): void => finish(false);
      const clearTimers = (): void => {
        if (pollTimer !== undefined) {
          clearTimeout(pollTimer);
        }
        if (lifetimeTimer !== undefined) {
          clearTimeout(lifetimeTimer);
        }
      };
      const finish = (endResponse: boolean): void => {
        if (finished) {
          return;
        }

        finished = true;
        clearTimers();
        response.removeListener("close", onClose);
        response.removeListener("error", onClose);

        if (endResponse && !response.writableEnded && !response.destroyed) {
          response.end();
        }

        void this.releaseLease(lease).finally(resolve);
      };
      const schedulePoll = (): void => {
        if (finished) {
          return;
        }

        pollTimer = setTimeout(() => {
          void poll();
        }, this.config.pollIntervalMs);
        pollTimer.unref?.();
      };
      const poll = async (): Promise<void> => {
        if (finished) {
          return;
        }

        try {
          if (!(await this.isSessionActive(input.userId, input.sessionId))) {
            finish(true);
            return;
          }

          const events = await this.repository.listEventsForUser(
            input.userId,
            input.reviewId,
            deliveredSequence,
            REVIEW_EVENT_STREAM_MAX_REPLAY + 1,
          );

          if (
            events.length > REVIEW_EVENT_STREAM_MAX_REPLAY ||
            (events.length > 0 && !isContiguous(events, deliveredSequence + 1))
          ) {
            const current = await this.repository.latestEventForUser(input.userId, input.reviewId);

            if (!current) {
              finish(false);
              return;
            }

            this.writeEvent(response, toResetSnapshot(current));
            deliveredSequence = current.sequence;
            if (isTerminal(current.status)) {
              finish(true);
              return;
            }
          } else if (events.length > 0) {
            for (const event of events) {
              this.writeEvent(response, toEvent(event));
              deliveredSequence = event.sequence;

              if (isTerminal(event.status)) {
                finish(true);
                return;
              }
            }
            heartbeatAt = Date.now();
          } else {
            const current = await this.repository.latestEventForUser(input.userId, input.reviewId);

            if (!current) {
              finish(false);
              return;
            }

            if (isTerminal(current.status)) {
              finish(true);
              return;
            }

            if (Date.now() - heartbeatAt >= this.config.heartbeatIntervalMs) {
              this.writeEvent(response, toHeartbeat(current));
              heartbeatAt = Date.now();
            }
          }

          schedulePoll();
        } catch {
          finish(false);
        }
      };

      response.once("close", onClose);
      response.once("error", onClose);

      try {
        for (const event of initial.events) {
          this.writeEvent(response, event);
        }

        if (isTerminal(latest.status)) {
          finish(true);
          return;
        }

        lifetimeTimer = setTimeout(() => finish(true), this.config.maxLifetimeMs);
        lifetimeTimer.unref?.();
        schedulePoll();
      } catch {
        finish(false);
      }
    });
  }

  private async isSessionActive(userId: string, sessionId: string): Promise<boolean> {
    if (!this.authRepository) {
      return process.env.NODE_ENV !== "production";
    }

    try {
      const [session, user] = await Promise.all([
        this.authRepository.findSessionById(sessionId),
        this.authRepository.findUserById(userId),
      ]);

      return Boolean(
        session &&
        user &&
        session.status === "ACTIVE" &&
        session.userId === user.id &&
        user.status === "ACTIVE",
      );
    } catch {
      return false;
    }
  }

  private async acquireLease(reviewId: string): Promise<ReviewStreamLease> {
    const ttlMs = this.config.maxLifetimeMs + 5_000;

    if (this.redisExecutor) {
      try {
        const result = await acquireReviewStreamLease(this.redisExecutor, { reviewId, ttlMs });

        if (!result.acquired || !result.token) {
          throw new ConflictException();
        }

        return { kind: "redis", reviewId, token: result.token };
      } catch (error) {
        if (error instanceof ConflictException) {
          throw error;
        }

        if (!(error instanceof RedisUnavailableError) || process.env.NODE_ENV === "production") {
          throw new ServiceUnavailableException();
        }
      }
    } else if (process.env.NODE_ENV === "production") {
      throw new ServiceUnavailableException();
    }

    if (this.localLeases.has(reviewId)) {
      throw new ConflictException();
    }

    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.localLeases.set(reviewId, token);
    return { kind: "local", reviewId, token };
  }

  private async releaseLease(lease: ReviewStreamLease): Promise<void> {
    if (lease.kind === "local") {
      if (this.localLeases.get(lease.reviewId) === lease.token) {
        this.localLeases.delete(lease.reviewId);
      }
      return;
    }

    if (!this.redisExecutor) {
      return;
    }

    try {
      await releaseReviewStreamLease(this.redisExecutor, lease.reviewId, lease.token);
    } catch {
      // The bounded Redis lease remains self-expiring when release fails.
    }
  }

  private async resolveInitialDelivery(
    userId: string,
    reviewId: string,
    cursor: ParsedCursor,
    latest: ReviewEventRecord,
  ): Promise<InitialDelivery> {
    if (
      cursor.kind === "INVALID" ||
      (cursor.kind === "VALID" && cursor.sequence > latest.sequence)
    ) {
      return {
        deliveredSequence: latest.sequence,
        events: [toResetSnapshot(latest)],
      };
    }

    if (cursor.kind === "ABSENT") {
      const events = await this.repository.listEventsForUser(
        userId,
        reviewId,
        0,
        REVIEW_EVENT_STREAM_MAX_REPLAY + 1,
      );

      if (
        events.length === 0 ||
        events.length > REVIEW_EVENT_STREAM_MAX_REPLAY ||
        !isContiguous(events, 1)
      ) {
        return {
          deliveredSequence: latest.sequence,
          events: [toResetSnapshot(latest)],
        };
      }

      return {
        deliveredSequence: events[events.length - 1]?.sequence ?? latest.sequence,
        events: events.map(toEvent),
      };
    }

    if (cursor.sequence === latest.sequence) {
      return { deliveredSequence: cursor.sequence, events: [] };
    }

    const first = (await this.repository.listEventsForUser(userId, reviewId, 0, 1))[0];

    if (!first || cursor.sequence < first.sequence - 1) {
      return {
        deliveredSequence: latest.sequence,
        events: [toResetSnapshot(latest)],
      };
    }

    const events = await this.repository.listEventsForUser(
      userId,
      reviewId,
      cursor.sequence,
      REVIEW_EVENT_STREAM_MAX_REPLAY + 1,
    );

    if (
      events.length === 0 ||
      events.length > REVIEW_EVENT_STREAM_MAX_REPLAY ||
      !isContiguous(events, cursor.sequence + 1)
    ) {
      return {
        deliveredSequence: latest.sequence,
        events: [toResetSnapshot(latest)],
      };
    }

    return {
      deliveredSequence: events[events.length - 1]?.sequence ?? cursor.sequence,
      events: events.map(toEvent),
    };
  }

  private writeEvent(response: Response, event: ReviewEvent): void {
    const data = JSON.stringify(event);

    if (Buffer.byteLength(data, "utf8") > REVIEW_EVENT_STREAM_MAX_PAYLOAD_BYTES) {
      throw new Error("Review lifecycle event payload exceeded the stream bound");
    }

    response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${data}\n\n`);
  }
}

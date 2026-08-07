import { z } from "zod";

export const REVIEW_EVENT_SCHEMA_VERSION = "v1" as const;
export const REVIEW_EVENT_MAX_ID_LENGTH = 10;
export const REVIEW_EVENT_MAX_GENERATION = 2_147_483_646;

export const REVIEW_EVENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export const REVIEW_EVENT_TYPES = [
  "snapshot",
  "completed",
  "failed",
  "cancelled",
  "heartbeat",
] as const;

const reviewIdSchema = z.string().trim().min(1).max(25);
const eventIdSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,9}$/u)
  .max(REVIEW_EVENT_MAX_ID_LENGTH);
const generationSchema = z.number().int().min(0).max(REVIEW_EVENT_MAX_GENERATION);

export const reviewEventStatusSchema = z.enum(REVIEW_EVENT_STATUSES);
export const reviewEventTypeSchema = z.enum(REVIEW_EVENT_TYPES);

const reviewEventBaseSchema = z
  .object({
    generation: generationSchema,
    id: eventIdSchema,
    resultAvailable: z.boolean(),
    reviewId: reviewIdSchema,
    schemaVersion: z.literal(REVIEW_EVENT_SCHEMA_VERSION),
    status: reviewEventStatusSchema,
  })
  .strict();

const reviewSnapshotEventSchema = reviewEventBaseSchema
  .extend({
    replay: z.enum(["current", "reset"]),
    retryable: z.boolean().optional(),
    type: z.literal("snapshot"),
  })
  .strict();

const reviewCompletedEventSchema = reviewEventBaseSchema
  .extend({
    resultAvailable: z.literal(true),
    status: z.literal("COMPLETED"),
    type: z.literal("completed"),
  })
  .strict();

const reviewFailedEventSchema = reviewEventBaseSchema
  .extend({
    retryable: z.boolean(),
    resultAvailable: z.literal(false),
    status: z.literal("FAILED"),
    type: z.literal("failed"),
  })
  .strict();

const reviewCancelledEventSchema = reviewEventBaseSchema
  .extend({
    resultAvailable: z.literal(false),
    status: z.literal("CANCELLED"),
    type: z.literal("cancelled"),
  })
  .strict();

const reviewHeartbeatEventSchema = reviewEventBaseSchema
  .extend({
    type: z.literal("heartbeat"),
  })
  .strict();

export const reviewEventSchema = z.discriminatedUnion("type", [
  reviewSnapshotEventSchema,
  reviewCompletedEventSchema,
  reviewFailedEventSchema,
  reviewCancelledEventSchema,
  reviewHeartbeatEventSchema,
]);

export type ReviewEventStatus = z.infer<typeof reviewEventStatusSchema>;
export type ReviewEventType = z.infer<typeof reviewEventTypeSchema>;
export type ReviewEvent = z.infer<typeof reviewEventSchema>;

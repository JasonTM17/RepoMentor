import { z } from "zod";

export const healthStatusSchema = z.enum(["ok", "not_ready"]);

export const livenessHealthPayloadSchema = z
  .object({
    status: z.literal("ok"),
  })
  .strict();

export const readinessHealthPayloadSchema = z
  .object({
    status: healthStatusSchema,
    scope: z.literal("application"),
  })
  .strict();

const boundedCounterSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const requestMetricsSchema = z
  .object({
    total: boundedCounterSchema,
    inFlight: boundedCounterSchema,
    completed: boundedCounterSchema,
    clientErrors: boundedCounterSchema,
    serverErrors: boundedCounterSchema,
  })
  .strict();

export const metricsHealthPayloadSchema = z
  .object({
    scope: z.literal("application"),
    requests: requestMetricsSchema,
  })
  .strict();

export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type LivenessHealthPayload = z.infer<typeof livenessHealthPayloadSchema>;
export type ReadinessHealthPayload = z.infer<typeof readinessHealthPayloadSchema>;
export type MetricsHealthPayload = z.infer<typeof metricsHealthPayloadSchema>;

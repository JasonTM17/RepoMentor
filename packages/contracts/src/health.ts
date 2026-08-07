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

const requestMetricsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    inFlight: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    clientErrors: z.number().int().nonnegative(),
    serverErrors: z.number().int().nonnegative(),
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

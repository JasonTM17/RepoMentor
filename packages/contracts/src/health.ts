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

export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type LivenessHealthPayload = z.infer<typeof livenessHealthPayloadSchema>;
export type ReadinessHealthPayload = z.infer<typeof readinessHealthPayloadSchema>;

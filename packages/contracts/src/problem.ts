import { z } from "zod";

export const API_PROBLEM_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  DEPENDENCY_UNAVAILABLE: "DEPENDENCY_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

const apiProblemCodeValues = [
  API_PROBLEM_CODES.BAD_REQUEST,
  API_PROBLEM_CODES.VALIDATION_FAILED,
  API_PROBLEM_CODES.UNAUTHORIZED,
  API_PROBLEM_CODES.FORBIDDEN,
  API_PROBLEM_CODES.NOT_FOUND,
  API_PROBLEM_CODES.CONFLICT,
  API_PROBLEM_CODES.RATE_LIMITED,
  API_PROBLEM_CODES.DEPENDENCY_UNAVAILABLE,
  API_PROBLEM_CODES.INTERNAL_ERROR,
] as const;

export const apiProblemCodeSchema = z.enum(apiProblemCodeValues);

const fieldErrorsSchema = z.record(
  z.string().trim().min(1).max(100),
  z.array(z.string().trim().min(1).max(300)).min(1).max(20),
);

export const apiProblemDetailsSchema = z
  .object({
    fieldErrors: fieldErrorsSchema.optional(),
    retryAfterSeconds: z.number().int().nonnegative().max(86_400).optional(),
  })
  .strict();

export const apiProblemSchema = z
  .object({
    code: apiProblemCodeSchema,
    message: z.string().trim().min(1).max(500),
    requestId: z.string().trim().min(1).max(128),
    details: apiProblemDetailsSchema.optional(),
  })
  .strict();

export type ApiProblemCode = z.infer<typeof apiProblemCodeSchema>;
export type ApiProblemDetails = z.infer<typeof apiProblemDetailsSchema>;
export type ApiProblem = z.infer<typeof apiProblemSchema>;

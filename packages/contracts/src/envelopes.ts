import { z } from "zod";

import { apiProblemSchema } from "./problem.js";

export const apiMetaSchema = z
  .object({
    requestId: z.string().trim().min(1).max(128).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(100).optional(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();

export const createApiSuccessEnvelopeSchema = <T extends z.ZodType>(dataSchema: T) =>
  z
    .object({
      data: dataSchema,
      meta: apiMetaSchema.optional(),
    })
    .strict();

export const apiSuccessEnvelopeSchema = createApiSuccessEnvelopeSchema(z.unknown());

export const apiErrorEnvelopeSchema = z
  .object({
    error: apiProblemSchema,
  })
  .strict();

export type ApiMeta = z.infer<typeof apiMetaSchema>;
export type ApiSuccessEnvelope<TData> = {
  data: TData;
  meta?: ApiMeta;
};
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

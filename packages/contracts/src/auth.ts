import { z } from "zod";

const authEmailSchema = z.string().trim().toLowerCase().email().max(254);
const authPasswordSchema = z.string().min(12).max(128);
const displayNameSchema = z.string().trim().min(1).max(80);
const userIdSchema = z.string().trim().min(1).max(64);
const timestampSchema = z.iso.datetime({ offset: true }).max(64);
const accessTokenSchema = z.string().trim().min(1).max(4096);

const authUserRoleValues = ["USER", "ADMIN"] as const;
const authUserStatusValues = ["ACTIVE", "DISABLED"] as const;

export const authUserRoleSchema = z.enum(authUserRoleValues);
export const authUserStatusSchema = z.enum(authUserStatusValues);

export const authRegisterInputSchema = z
  .object({
    email: authEmailSchema,
    password: authPasswordSchema,
    displayName: displayNameSchema,
  })
  .strict();

export const authLoginInputSchema = z
  .object({
    email: authEmailSchema,
    password: authPasswordSchema,
  })
  .strict();

export const publicUserSchema = z
  .object({
    id: userIdSchema,
    email: authEmailSchema,
    displayName: displayNameSchema,
    role: authUserRoleSchema,
    status: authUserStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const accessTokenAuthResultSchema = z
  .object({
    accessToken: accessTokenSchema,
    tokenType: z.literal("Bearer"),
    expiresInSeconds: z.number().int().positive().max(3_600),
    user: publicUserSchema,
  })
  .strict();

export type AuthUserRole = z.infer<typeof authUserRoleSchema>;
export type AuthUserStatus = z.infer<typeof authUserStatusSchema>;
export type AuthRegisterInput = z.infer<typeof authRegisterInputSchema>;
export type AuthLoginInput = z.infer<typeof authLoginInputSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type AccessTokenAuthResult = z.infer<typeof accessTokenAuthResultSchema>;

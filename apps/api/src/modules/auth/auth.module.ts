import { Module } from "@nestjs/common";

import { AuthAccessGuard } from "./auth-access.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthRateLimitGuard, AuthRateLimiter } from "./auth-rate-limiter.js";
import { AuthService } from "./auth.service.js";
import { AuthTokenService } from "./auth-token.service.js";
import { AUTH_REPOSITORY } from "./auth.types.js";
import { PasswordHasherService } from "./password-hasher.service.js";
import { PrismaAuthRepository } from "./prisma-auth.repository.js";
import { PrismaService } from "./prisma.service.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthAccessGuard,
    AuthRateLimitGuard,
    AuthRateLimiter,
    AuthService,
    AuthTokenService,
    PasswordHasherService,
    PrismaAuthRepository,
    PrismaService,
    {
      provide: AUTH_REPOSITORY,
      useExisting: PrismaAuthRepository,
    },
  ],
  exports: [
    AuthAccessGuard,
    AuthRateLimitGuard,
    AuthRateLimiter,
    AuthService,
    AuthTokenService,
    PrismaService,
  ],
})
export class AuthModule {}

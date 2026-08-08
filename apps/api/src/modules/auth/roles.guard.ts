import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { isAuthUserRole } from "./auth.types.js";
import type { AuthContext } from "./auth.types.js";
import { AUTH_REQUIRED_ROLES } from "./roles.decorator.js";
import type { AuthenticatedRequest } from "./auth-access.guard.js";

function isValidatedAuthContext(auth: AuthenticatedRequest["auth"]): auth is AuthContext {
  return (
    auth !== undefined &&
    typeof auth.userId === "string" &&
    auth.userId.length > 0 &&
    typeof auth.sessionId === "string" &&
    auth.sessionId.length > 0 &&
    isAuthUserRole(auth.role)
  );
}

function isRequiredRoleList(value: unknown): value is readonly AuthContext["role"][] {
  return Array.isArray(value) && value.length > 0 && value.every(isAuthUserRole);
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!isValidatedAuthContext(request.auth)) {
      throw new ForbiddenException();
    }

    const requiredRoles = this.reflector.getAllAndOverride<unknown>(AUTH_REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles === undefined) {
      return true;
    }

    if (!isRequiredRoleList(requiredRoles) || !requiredRoles.includes(request.auth.role)) {
      throw new ForbiddenException();
    }

    return true;
  }
}

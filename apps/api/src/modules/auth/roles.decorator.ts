import { SetMetadata, type CustomDecorator } from "@nestjs/common";

import type { AuthUserRole } from "./auth.types.js";

export const AUTH_REQUIRED_ROLES = Symbol("AUTH_REQUIRED_ROLES");

export const Roles = (
  ...roles: [AuthUserRole, ...AuthUserRole[]]
): CustomDecorator<typeof AUTH_REQUIRED_ROLES> => SetMetadata(AUTH_REQUIRED_ROLES, roles);

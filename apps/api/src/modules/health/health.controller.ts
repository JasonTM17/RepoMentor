import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type {
  LivenessHealthPayload,
  MetricsHealthPayload,
  ReadinessHealthPayload,
} from "@repomentor/contracts";

import { AuthAccessGuard } from "../auth/auth-access.guard.js";
import { Roles } from "../auth/roles.decorator.js";
import { RolesGuard } from "../auth/roles.guard.js";
import { HealthMetricsService } from "./health.metrics.js";
import { HealthService } from "./health.service.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly healthMetricsService: HealthMetricsService,
  ) {}

  @ApiOkResponse({ description: "The API process is alive." })
  @ApiOperation({ summary: "Check API liveness" })
  @Get("live")
  getLiveness(): LivenessHealthPayload {
    return this.healthService.getLiveness();
  }

  @ApiOkResponse({ description: "The application is ready to receive work." })
  @ApiOperation({ summary: "Check application readiness" })
  @Get("ready")
  getReadiness(): ReadinessHealthPayload {
    return this.healthService.getReadiness();
  }

  @ApiUnauthorizedResponse({ description: "Authentication is required." })
  @ApiForbiddenResponse({ description: "An ADMIN role is required." })
  @ApiOkResponse({ description: "Return aggregate application request metrics." })
  @ApiOperation({ summary: "Read aggregate application metrics" })
  @Roles("ADMIN")
  @UseGuards(AuthAccessGuard, RolesGuard)
  @Get("metrics")
  getMetrics(): MetricsHealthPayload {
    return this.healthMetricsService.getMetrics();
  }
}

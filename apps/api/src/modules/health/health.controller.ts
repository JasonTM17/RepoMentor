import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  LivenessHealthPayload,
  MetricsHealthPayload,
  ReadinessHealthPayload,
} from "@repomentor/contracts";

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

  @ApiOkResponse({ description: "Return aggregate application request metrics." })
  @ApiOperation({ summary: "Read aggregate application metrics" })
  @Get("metrics")
  getMetrics(): MetricsHealthPayload {
    return this.healthMetricsService.getMetrics();
  }
}

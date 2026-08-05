import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { LivenessHealthPayload, ReadinessHealthPayload } from "@repomentor/contracts";

import { HealthService } from "./health.service.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

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
}

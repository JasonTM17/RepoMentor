import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { HealthService, type HealthPayload } from "./health.service.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @ApiOkResponse({ description: "The API process is alive." })
  @ApiOperation({ summary: "Check API liveness" })
  @Get("live")
  getLiveness(): HealthPayload {
    return this.healthService.getLiveness();
  }

  @ApiOkResponse({ description: "The application is ready to receive work." })
  @ApiOperation({ summary: "Check application readiness" })
  @Get("ready")
  getReadiness(): HealthPayload {
    return this.healthService.getReadiness();
  }
}

import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller.js";
import { HealthMetricsService } from "./health.metrics.js";
import { HealthService } from "./health.service.js";

@Module({
  controllers: [HealthController],
  providers: [HealthMetricsService, HealthService],
  exports: [HealthMetricsService],
})
export class HealthModule {}

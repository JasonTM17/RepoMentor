import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { HealthController } from "./health.controller.js";
import { HealthMetricsService } from "./health.metrics.js";
import { HealthService } from "./health.service.js";

@Module({
  imports: [AuthModule],
  controllers: [HealthController],
  providers: [HealthMetricsService, HealthService],
  exports: [HealthMetricsService],
})
export class HealthModule {}

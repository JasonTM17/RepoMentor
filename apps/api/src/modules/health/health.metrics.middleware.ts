import type { NextFunction, Request, Response } from "express";

import { HealthMetricsService } from "./health.metrics.js";

export function createHealthMetricsMiddleware(metrics: HealthMetricsService) {
  return (_request: Request, response: Response, next: NextFunction): void => {
    metrics.recordRequestStarted();

    let recorded = false;
    const recordCompletion = (): void => {
      if (recorded) {
        return;
      }

      recorded = true;
      metrics.recordRequestFinished(response.statusCode);
    };

    response.once("finish", recordCompletion);
    response.once("close", recordCompletion);
    next();
  };
}

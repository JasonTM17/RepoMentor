import { Injectable } from "@nestjs/common";
import type { MetricsHealthPayload } from "@repomentor/contracts";

const MAX_COUNTER = Number.MAX_SAFE_INTEGER;

function increment(counter: number): number {
  return Math.min(counter + 1, MAX_COUNTER);
}

@Injectable()
export class HealthMetricsService {
  private totalRequests = 0;
  private inFlightRequests = 0;
  private completedRequests = 0;
  private clientErrors = 0;
  private serverErrors = 0;

  recordRequestStarted(): void {
    this.totalRequests = increment(this.totalRequests);
    this.inFlightRequests = increment(this.inFlightRequests);
  }

  recordRequestFinished(statusCode: number): void {
    this.inFlightRequests = Math.max(0, this.inFlightRequests - 1);
    this.completedRequests = increment(this.completedRequests);

    if (statusCode >= 400 && statusCode < 500) {
      this.clientErrors = increment(this.clientErrors);
    }

    if (statusCode >= 500 && statusCode < 600) {
      this.serverErrors = increment(this.serverErrors);
    }
  }

  getMetrics(): MetricsHealthPayload {
    return {
      scope: "application",
      requests: {
        total: this.totalRequests,
        inFlight: this.inFlightRequests,
        completed: this.completedRequests,
        clientErrors: this.clientErrors,
        serverErrors: this.serverErrors,
      },
    };
  }
}

import { Injectable } from "@nestjs/common";

export interface HealthPayload {
  status: "ok";
  service: "api";
  checks: {
    application: "up";
  };
}

@Injectable()
export class HealthService {
  getLiveness(): HealthPayload {
    return {
      checks: { application: "up" },
      service: "api",
      status: "ok",
    };
  }

  getReadiness(): HealthPayload {
    return this.getLiveness();
  }
}

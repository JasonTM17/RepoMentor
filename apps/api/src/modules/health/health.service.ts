import { Injectable } from "@nestjs/common";

import type { LivenessHealthPayload, ReadinessHealthPayload } from "@repomentor/contracts";

@Injectable()
export class HealthService {
  getLiveness(): LivenessHealthPayload {
    return { status: "ok" };
  }

  getReadiness(): ReadinessHealthPayload {
    return { scope: "application", status: "ok" };
  }
}

import { createApp } from "./app.js";
import { parseEnvironment } from "./config/environment.js";
import { parseAuthTokenConfig } from "./modules/auth/auth-token.service.js";
import { parseQuotaAdmissionFingerprintConfig } from "./modules/usage/quota-admission.config.js";

async function bootstrap(): Promise<void> {
  const config = parseEnvironment();

  if (config.nodeEnv !== "test") {
    parseAuthTokenConfig();
    parseQuotaAdmissionFingerprintConfig();
  }

  const app = await createApp({ enableSwagger: config.nodeEnv !== "production" });
  await app.listen(config.port);
}

void bootstrap().catch(() => {
  process.exitCode = 1;
});

import { createApp } from "./app.js";
import { parseEnvironment } from "./config/environment.js";
import { parseAuthTokenConfig } from "./modules/auth/auth-token.service.js";

async function bootstrap(): Promise<void> {
  const config = parseEnvironment();

  if (config.nodeEnv !== "test") {
    parseAuthTokenConfig();
  }

  const app = await createApp();
  await app.listen(config.port);
}

void bootstrap().catch(() => {
  process.exitCode = 1;
});

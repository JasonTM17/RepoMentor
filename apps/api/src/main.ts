import { createApp } from "./app.js";
import { parseEnvironment } from "./config/environment.js";

async function bootstrap(): Promise<void> {
  const config = parseEnvironment();
  const app = await createApp();
  await app.listen(config.port);
}

void bootstrap().catch(() => {
  process.exitCode = 1;
});

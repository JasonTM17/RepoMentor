import { createApp } from "./app.js";

const DEFAULT_PORT = 3000;
const MAX_PORT = 65_535;

function resolvePort(rawPort: string | undefined): number {
  if (rawPort === undefined || rawPort.trim() === "") {
    return DEFAULT_PORT;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`PORT must be an integer between 1 and ${MAX_PORT}`);
  }

  return port;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(resolvePort(process.env.PORT));
}

void bootstrap().catch(() => {
  process.exitCode = 1;
});

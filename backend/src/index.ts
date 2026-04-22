import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

import { createApp } from "./app.js";
import { getBackendConfig } from "./config.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const repoEnvPath = path.resolve(currentDir, "../../.env");

if (existsSync(repoEnvPath)) {
  loadEnv({ path: repoEnvPath });
} else {
  loadEnv();
}

async function bootstrap() {
  const app = createApp();
  const config = getBackendConfig();

  app.listen(config.PORT, () => {
    console.log(`Backend API listening on :${config.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});

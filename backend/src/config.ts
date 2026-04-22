import { z } from "zod";

import { getSharedEnv } from "@platform/utils";

const backendSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000)
});

interface BackendRuntimeConfig {
  PORT: number;
  MONGODB_URI: string;
  DOMAIN_NAME: string;
  WEBHOOK_SECRET: string;
  NEXTAUTH_SECRET: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  BACKEND_PUBLIC_URL: string;
  DEPLOY_ROOT: string;
  NGINX_SITES_AVAILABLE_DIR: string;
  NGINX_SITES_ENABLED_DIR: string;
  NGINX_BIN: string;
  DEPLOY_LOG_LINES: number;
  WEBHOOK_CALLBACK_URL: string;
}

export type BackendConfig = BackendRuntimeConfig;

let cachedConfig: BackendRuntimeConfig | null = null;

export function getBackendConfig(): BackendRuntimeConfig {
  if (!cachedConfig) {
    const sharedEnv = getSharedEnv();
    const local = backendSchema.parse(process.env);
    const callbackBaseUrl = sharedEnv.BACKEND_PUBLIC_URL.replace(/\/$/, "");

    cachedConfig = {
      ...sharedEnv,
      PORT: local.PORT,
      WEBHOOK_CALLBACK_URL: `${callbackBaseUrl}/api/webhook`
    };
  }

  return cachedConfig;
}

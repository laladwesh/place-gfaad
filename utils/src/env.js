import { z } from "zod";
const sharedEnvSchema = z.object({
    REDIS_URL: z.string().min(1),
    DOMAIN_NAME: z.string().min(1),
    WEBHOOK_SECRET: z.string().min(1),
    NEXTAUTH_SECRET: z.string().min(1),
    BACKEND_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
    DEPLOY_ROOT: z.string().default("/var/lib/mini-paas/deployments"),
    NGINX_SITES_AVAILABLE_DIR: z
        .string()
        .default("/etc/nginx/sites-available"),
    NGINX_SITES_ENABLED_DIR: z.string().default("/etc/nginx/sites-enabled"),
    NGINX_BIN: z.string().default("nginx"),
    DEPLOY_LOG_LINES: z.coerce.number().int().positive().default(2000)
});
let cachedEnv = null;
export function getSharedEnv() {
    if (!cachedEnv) {
        cachedEnv = sharedEnvSchema.parse(process.env);
    }
    return cachedEnv;
}
//# sourceMappingURL=env.js.map
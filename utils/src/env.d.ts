import { z } from "zod";
declare const sharedEnvSchema: z.ZodObject<{
    REDIS_URL: z.ZodString;
    DOMAIN_NAME: z.ZodString;
    WEBHOOK_SECRET: z.ZodString;
    NEXTAUTH_SECRET: z.ZodString;
    BACKEND_PUBLIC_URL: z.ZodDefault<z.ZodString>;
    DEPLOY_ROOT: z.ZodDefault<z.ZodString>;
    NGINX_SITES_AVAILABLE_DIR: z.ZodDefault<z.ZodString>;
    NGINX_SITES_ENABLED_DIR: z.ZodDefault<z.ZodString>;
    NGINX_BIN: z.ZodDefault<z.ZodString>;
    DEPLOY_LOG_LINES: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    REDIS_URL: string;
    DOMAIN_NAME: string;
    WEBHOOK_SECRET: string;
    NEXTAUTH_SECRET: string;
    BACKEND_PUBLIC_URL: string;
    DEPLOY_ROOT: string;
    NGINX_SITES_AVAILABLE_DIR: string;
    NGINX_SITES_ENABLED_DIR: string;
    NGINX_BIN: string;
    DEPLOY_LOG_LINES: number;
}, {
    REDIS_URL: string;
    DOMAIN_NAME: string;
    WEBHOOK_SECRET: string;
    NEXTAUTH_SECRET: string;
    BACKEND_PUBLIC_URL?: string | undefined;
    DEPLOY_ROOT?: string | undefined;
    NGINX_SITES_AVAILABLE_DIR?: string | undefined;
    NGINX_SITES_ENABLED_DIR?: string | undefined;
    NGINX_BIN?: string | undefined;
    DEPLOY_LOG_LINES?: number | undefined;
}>;
export type SharedEnv = z.infer<typeof sharedEnvSchema>;
export declare function getSharedEnv(): SharedEnv;
export {};
//# sourceMappingURL=env.d.ts.map
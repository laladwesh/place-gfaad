import { Redis } from "ioredis";
import { getSharedEnv } from "./env.js";
let redisClient = null;
let bullConnection = null;
function parseRedisDb(pathname) {
    const raw = pathname.replace("/", "").trim();
    if (!raw) {
        return 0;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
}
export function getRedisClient() {
    if (!redisClient) {
        const env = getSharedEnv();
        redisClient = new Redis(env.REDIS_URL, {
            maxRetriesPerRequest: null
        });
        redisClient.on("error", (error) => {
            console.error("Redis connection error", error);
        });
    }
    return redisClient;
}
export function getBullConnection() {
    if (!bullConnection) {
        const env = getSharedEnv();
        const url = new URL(env.REDIS_URL);
        bullConnection = {
            host: url.hostname,
            port: Number.parseInt(url.port || "6379", 10),
            db: parseRedisDb(url.pathname),
            username: url.username ? decodeURIComponent(url.username) : undefined,
            password: url.password ? decodeURIComponent(url.password) : undefined,
            tls: url.protocol === "rediss:" ? {} : undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false
        };
    }
    return bullConnection;
}
//# sourceMappingURL=redis.js.map
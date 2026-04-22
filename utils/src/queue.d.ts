import { Queue } from "bullmq";
import type { DeployJobData } from "./types.js";
export declare const DEPLOY_QUEUE_NAME = "deploy-queue";
export declare function getDeployQueue(): Queue<DeployJobData>;
export declare function enqueueDeployment(data: DeployJobData): Promise<import("bullmq").Job<DeployJobData, any, string>>;
//# sourceMappingURL=queue.d.ts.map
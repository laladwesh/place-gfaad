import { Queue } from "bullmq";
import { getBullConnection } from "./redis.js";
export const DEPLOY_QUEUE_NAME = "deploy-queue";
let queue = null;
export function getDeployQueue() {
    if (!queue) {
        queue = new Queue(DEPLOY_QUEUE_NAME, {
            connection: getBullConnection(),
            defaultJobOptions: {
                attempts: 4,
                removeOnComplete: 200,
                removeOnFail: 500,
                backoff: {
                    type: "exponential",
                    delay: 5000
                }
            }
        });
    }
    return queue;
}
export async function enqueueDeployment(data) {
    const queueRef = getDeployQueue();
    const targetType = data.isPreview ? `pr-${data.prNumber ?? "x"}` : "prod";
    const jobId = `${data.projectId}:${targetType}:${data.commitSha.slice(0, 12)}:${Date.now()}`;
    return queueRef.add("deploy", data, {
        jobId
    });
}
//# sourceMappingURL=queue.js.map
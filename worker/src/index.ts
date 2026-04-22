import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { config as loadEnv } from "dotenv";

import {
  claimNextJob,
  completeJob,
  failJob,
  recoverStalledJobs,
  type DeployJob
} from "@platform/utils";

import { processDeploymentJob } from "./services/deploy.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const repoEnvPath = path.resolve(currentDir, "../../.env");

if (existsSync(repoEnvPath)) {
  loadEnv({ path: repoEnvPath });
} else {
  loadEnv();
}

const CONCURRENCY = 2;
const POLL_INTERVAL_MS = 2000;

let running = true;
let activeJobs = 0;

async function processJob(job: DeployJob): Promise<void> {
  activeJobs++;
  try {
    console.log(`[worker] Starting deployment: ${job.jobId}`);
    await processDeploymentJob(job.data);
    await completeJob(job.jobId);
    console.log(`[worker] Deployment completed: ${job.jobId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failJob(job.jobId, message);
    console.error(`[worker] Deployment failed: ${job.jobId} —`, message);
  } finally {
    activeJobs--;
  }
}

async function pollLoop(): Promise<void> {
  await recoverStalledJobs();
  console.log("[worker] Started — polling MongoDB for deployment jobs...");

  while (running) {
    if (activeJobs < CONCURRENCY) {
      try {
        const job = await claimNextJob();
        if (job) {
          void processJob(job);
        } else {
          await sleep(POLL_INTERVAL_MS);
        }
      } catch (error) {
        console.error("[worker] Poll error:", error);
        await sleep(POLL_INTERVAL_MS);
      }
    } else {
      await sleep(500);
    }
  }
}

async function shutdown(): Promise<void> {
  console.log("[worker] Shutting down...");
  running = false;
  const deadline = Date.now() + 30_000;
  while (activeJobs > 0 && Date.now() < deadline) {
    await sleep(500);
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await pollLoop();

import { getDb } from "./mongodb.js";
import type { DeployJobData } from "./types.js";

export const DEPLOY_QUEUE_NAME = "deploy_jobs";

export interface DeployJob {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  data: DeployJobData;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export async function enqueueDeployment(data: DeployJobData): Promise<{ id: string }> {
  const db = await getDb();
  const targetType = data.isPreview ? `pr-${data.prNumber ?? "x"}` : "prod";
  const jobId = `${data.projectId}-${targetType}-${data.commitSha.slice(0, 12)}-${Date.now()}`;

  const job: DeployJob = {
    jobId,
    status: "pending",
    data,
    createdAt: new Date().toISOString()
  };

  await db.collection<DeployJob>(DEPLOY_QUEUE_NAME).insertOne(job as any);
  return { id: jobId };
}

export async function claimNextJob(): Promise<DeployJob | null> {
  const db = await getDb();
  const doc = await db.collection(DEPLOY_QUEUE_NAME).findOneAndUpdate(
    { status: "pending" },
    { $set: { status: "processing", startedAt: new Date().toISOString() } },
    { sort: { createdAt: 1 }, returnDocument: "after" }
  );
  return doc as DeployJob | null;
}

export async function completeJob(jobId: string): Promise<void> {
  const db = await getDb();
  await db.collection(DEPLOY_QUEUE_NAME).updateOne(
    { jobId },
    { $set: { status: "completed", completedAt: new Date().toISOString() } }
  );
}

export async function failJob(jobId: string, error: string): Promise<void> {
  const db = await getDb();
  await db.collection(DEPLOY_QUEUE_NAME).updateOne(
    { jobId },
    { $set: { status: "failed", completedAt: new Date().toISOString(), error } }
  );
}

export async function recoverStalledJobs(): Promise<void> {
  const db = await getDb();
  const result = await db.collection(DEPLOY_QUEUE_NAME).updateMany(
    { status: "processing" },
    { $set: { status: "failed", error: "Worker restarted while job was processing", completedAt: new Date().toISOString() } }
  );
  if (result.modifiedCount > 0) {
    console.log(`[worker] Marked ${result.modifiedCount} stalled job(s) as failed on startup`);
  }
}

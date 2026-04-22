import { MongoClient, type Db } from "mongodb";

import { getSharedEnv } from "./env.js";

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

export async function getDb(): Promise<Db> {
  if (!dbInstance) {
    const env = getSharedEnv();
    client = new MongoClient(env.MONGODB_URI);
    await client.connect();
    dbInstance = client.db("mini-paas");
    await ensureIndexes(dbInstance);
  }
  return dbInstance;
}

async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("projects").createIndex({ id: 1 }, { unique: true, background: true });
  await db.collection("projects").createIndex({ ownerLogin: 1 }, { background: true });
  await db.collection("projects").createIndex({ repoOwner: 1, repoName: 1 }, { background: true });
  await db.collection("projects").createIndex({ repoOwner: 1, repoName: 1, branch: 1 }, { background: true });
  await db.collection("deployments").createIndex({ id: 1 }, { unique: true, background: true });
  await db.collection("deployments").createIndex({ projectId: 1, createdAt: -1 }, { background: true });
  await db.collection("deployment_logs").createIndex({ deploymentId: 1 }, { unique: true, background: true });
  await db.collection("env_vars").createIndex({ projectId: 1 }, { unique: true, background: true });
  await db.collection("deploy_jobs").createIndex({ status: 1, createdAt: 1 }, { background: true });
  await db.collection("deploy_jobs").createIndex({ jobId: 1 }, { unique: true, background: true });
}

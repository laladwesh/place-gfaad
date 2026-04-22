import { randomUUID } from "node:crypto";

import { getDb } from "./mongodb.js";
import { getSharedEnv } from "./env.js";
import { normalizeGithubIdentifier } from "./security.js";
import type { Deployment, DeploymentStatus, Project } from "./types.js";

export async function saveProject(project: Project): Promise<Project> {
  const db = await getDb();
  const normalized: Project = {
    ...project,
    ownerLogin: normalizeGithubIdentifier(project.ownerLogin),
    repoOwner: normalizeGithubIdentifier(project.repoOwner),
    repoName: normalizeGithubIdentifier(project.repoName),
    branch: project.branch.trim(),
    updatedAt: new Date().toISOString()
  };
  await db.collection("projects").replaceOne({ id: normalized.id }, normalized, { upsert: true });
  return normalized;
}

export async function getProject(projectId: string): Promise<Project | null> {
  const db = await getDb();
  const doc = await db.collection("projects").findOne({ id: projectId });
  if (!doc) return null;
  const { _id, ...project } = doc;
  return project as Project;
}

export async function listProjects(ownerLogin: string): Promise<Project[]> {
  const db = await getDb();
  const normalized = normalizeGithubIdentifier(ownerLogin);
  const docs = await db.collection("projects").find({ ownerLogin: normalized }).toArray();
  return docs.map(({ _id, ...doc }) => doc as Project);
}

export async function findProjectByRepository(
  owner: string,
  repo: string,
  branch?: string
): Promise<Project | null> {
  const db = await getDb();
  const query: Record<string, string> = {
    repoOwner: normalizeGithubIdentifier(owner),
    repoName: normalizeGithubIdentifier(repo)
  };
  if (branch) {
    const exactDoc = await db.collection("projects").findOne({ ...query, branch: branch.trim() });
    if (exactDoc) {
      const { _id, ...p } = exactDoc;
      return p as Project;
    }
  }
  const doc = await db.collection("projects").findOne(query);
  if (!doc) return null;
  const { _id, ...project } = doc;
  return project as Project;
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await getDb();
  await db.collection("projects").deleteOne({ id: projectId });
  await db.collection("deployments").deleteMany({ projectId });
  await db.collection("deployment_logs").deleteMany({ deploymentId: { $regex: `^${projectId}` } });
  await db.collection("env_vars").deleteOne({ projectId });
  await db.collection("deploy_jobs").deleteMany({ "data.projectId": projectId });
}

export async function createDeployment(
  input: Omit<Deployment, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<Deployment> {
  const now = new Date().toISOString();
  const deployment: Deployment = {
    ...input,
    id: input.id ?? randomUUID(),
    createdAt: now,
    updatedAt: now
  };
  await saveDeployment(deployment);
  return deployment;
}

export async function saveDeployment(deployment: Deployment): Promise<void> {
  const db = await getDb();
  await db.collection("deployments").replaceOne({ id: deployment.id }, deployment, { upsert: true });
}

export async function getDeployment(deploymentId: string): Promise<Deployment | null> {
  const db = await getDb();
  const doc = await db.collection("deployments").findOne({ id: deploymentId });
  if (!doc) return null;
  const { _id, ...deployment } = doc;
  return deployment as Deployment;
}

export async function listDeployments(projectId: string, limit = 20): Promise<Deployment[]> {
  const db = await getDb();
  const docs = await db
    .collection("deployments")
    .find({ projectId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(({ _id, ...doc }) => doc as Deployment);
}

export async function updateDeployment(
  deploymentId: string,
  updates: Partial<Deployment>
): Promise<Deployment> {
  const current = await getDeployment(deploymentId);
  if (!current) throw new Error(`Deployment ${deploymentId} not found`);
  const updated: Deployment = {
    ...current,
    ...updates,
    id: current.id,
    updatedAt: new Date().toISOString()
  };
  await saveDeployment(updated);
  return updated;
}

export async function setDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
  updates?: Partial<Deployment>
): Promise<Deployment> {
  return updateDeployment(deploymentId, { ...updates, status });
}

export async function appendDeploymentLog(deploymentId: string, line: string): Promise<void> {
  const env = getSharedEnv();
  const db = await getDb();
  await db.collection("deployment_logs").updateOne(
    { deploymentId },
    { $push: { logs: { $each: [line], $slice: -env.DEPLOY_LOG_LINES } } } as any,
    { upsert: true }
  );
}

export async function appendDeploymentLogs(deploymentId: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  const env = getSharedEnv();
  const db = await getDb();
  await db.collection("deployment_logs").updateOne(
    { deploymentId },
    { $push: { logs: { $each: lines, $slice: -env.DEPLOY_LOG_LINES } } } as any,
    { upsert: true }
  );
}

export async function getDeploymentLogs(deploymentId: string, limit = 500): Promise<string[]> {
  const db = await getDb();
  const doc = await db.collection("deployment_logs").findOne({ deploymentId });
  if (!doc?.logs) return [];
  const logs = doc.logs as string[];
  return logs.slice(-limit);
}

export async function setProjectActiveDeployment(
  projectId: string,
  activeDeploymentId: string
): Promise<Project> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  project.activeDeploymentId = activeDeploymentId;
  project.updatedAt = new Date().toISOString();
  return saveProject(project);
}

export async function setProjectEnvVars(
  projectId: string,
  variables: Record<string, string>
): Promise<void> {
  const db = await getDb();
  await db
    .collection("env_vars")
    .replaceOne({ projectId }, { projectId, variables }, { upsert: true });
}

export async function getProjectEnvVars(projectId: string): Promise<Record<string, string>> {
  const db = await getDb();
  const doc = await db.collection("env_vars").findOne({ projectId });
  return (doc?.variables as Record<string, string>) ?? {};
}

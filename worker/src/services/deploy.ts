import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { configureProjectRouting } from "@platform/nginx";
import {
  appendDeploymentLog,
  appendDeploymentLogs,
  createDeployment,
  createOrUpdatePRComment,
  decryptSecret,
  getDeployment,
  getProject,
  getProjectEnvVars,
  getSharedEnv,
  listDeployments,
  setCommitStatus,
  setDeploymentStatus,
  setProjectActiveDeployment,
  updateDeployment,
  type DeployJobData,
  type Deployment,
  type Project
} from "@platform/utils";
import getPort, { portNumbers } from "get-port";

import { ensureDockerAssets } from "./docker-assets.js";
import { runCommand } from "../utils/shell.js";

const HEALTH_CHECK_RETRIES = 25;
const HEALTH_CHECK_INTERVAL_MS = 1500;

function deploymentSubdomain(project: Project, jobData: DeployJobData): string {
  if (jobData.isPreview) {
    const prNumber = jobData.prNumber ?? 0;
    return `pr-${prNumber}--${project.slug}`;
  }
  return project.slug;
}

async function writeLog(deploymentId: string, line: string): Promise<void> {
  await appendDeploymentLog(
    deploymentId,
    `[${new Date().toISOString()}] ${line.trim()}`
  );
}

async function isCancelRequested(deploymentId: string): Promise<boolean> {
  const dep = await getDeployment(deploymentId);
  return dep?.cancelRequested === true || dep?.status === "cancelled";
}

async function checkCancellation(deploymentId: string, label: string): Promise<void> {
  if (await isCancelRequested(deploymentId)) {
    throw new Error(`[cancelled] Deployment cancelled at: ${label}`);
  }
}

async function markCommitPending(project: Project, commitSha: string, targetUrl: string): Promise<void> {
  const env = getSharedEnv();
  const token = decryptSecret(project.encryptedAccessToken, env.NEXTAUTH_SECRET);
  await setCommitStatus({ token, owner: project.repoOwner, repo: project.repoName, sha: commitSha, state: "pending", description: "Deployment started", targetUrl });
}

async function markCommitResult(
  project: Project,
  commitSha: string,
  state: "success" | "failure",
  description: string,
  targetUrl: string
): Promise<void> {
  const env = getSharedEnv();
  const token = decryptSecret(project.encryptedAccessToken, env.NEXTAUTH_SECRET);
  await setCommitStatus({ token, owner: project.repoOwner, repo: project.repoName, sha: commitSha, state, description, targetUrl });
}

async function waitForContainer(deploymentId: string, port: number): Promise<void> {
  for (let attempt = 0; attempt < HEALTH_CHECK_RETRIES; attempt += 1) {
    if (await isCancelRequested(deploymentId)) {
      throw new Error("[cancelled] Deployment cancelled during health check");
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}`, { method: "GET" });
      if (response.status < 500) return;
    } catch {
      // not ready yet
    }
    await delay(HEALTH_CHECK_INTERVAL_MS);
  }
  throw new Error("Container did not become reachable in time");
}

async function stopAndRemoveContainer(containerId: string): Promise<void> {
  await runCommand("docker", ["rm", "-f", containerId], { allowFailure: true });
}

async function findPreviousDeployment(
  project: Project,
  jobData: DeployJobData,
  currentDeploymentId: string
): Promise<Deployment | null> {
  if (!jobData.isPreview) {
    if (!project.activeDeploymentId) return null;
    const active = await getDeployment(project.activeDeploymentId);
    return active && active.id !== currentDeploymentId ? active : null;
  }
  const deployments = await listDeployments(project.id, 100);
  return (
    deployments.find(
      (d) =>
        d.id !== currentDeploymentId &&
        d.isPreview &&
        d.prNumber === jobData.prNumber &&
        (d.status === "success" || d.status === "running")
    ) ?? null
  );
}

function createCloneUrl(project: Project, decryptedToken: string): string {
  const encodedToken = encodeURIComponent(decryptedToken);
  return `https://x-access-token:${encodedToken}@github.com/${project.repoOwner}/${project.repoName}.git`;
}

async function postPRComment(
  project: Project,
  jobData: DeployJobData,
  deploymentUrl: string,
  status: "success" | "failure",
  errorMessage?: string
): Promise<void> {
  if (!jobData.isPreview || !jobData.prNumber) return;
  try {
    const env = getSharedEnv();
    const token = decryptSecret(project.encryptedAccessToken, env.NEXTAUTH_SECRET);
    const markerTag = `<!-- onawie-preview-${project.id} -->`;
    let body: string;

    if (status === "success") {
      body = `${markerTag}
### ✅ Preview Deployment Ready

| | |
|---|---|
| **Project** | ${project.name} |
| **Branch** | \`${jobData.branch}\` |
| **Commit** | \`${jobData.commitSha.slice(0, 8)}\` |
| **Preview URL** | [${deploymentUrl}](${deploymentUrl}) |

Deployed by [onawie.io](https://${env.DOMAIN_NAME})`;
    } else {
      body = `${markerTag}
### ❌ Preview Deployment Failed

| | |
|---|---|
| **Project** | ${project.name} |
| **Branch** | \`${jobData.branch}\` |
| **Commit** | \`${jobData.commitSha.slice(0, 8)}\` |
| **Error** | ${errorMessage ?? "Unknown error"} |

Check your deployment logs in the dashboard.`;
    }

    await createOrUpdatePRComment({
      token,
      owner: project.repoOwner,
      repo: project.repoName,
      prNumber: jobData.prNumber,
      body,
      markerTag
    });
  } catch (err) {
    console.error("[deploy] Failed to post PR comment:", err);
  }
}

export async function processDeploymentJob(jobData: DeployJobData): Promise<void> {
  const env = getSharedEnv();
  const project = await getProject(jobData.projectId);
  if (!project) throw new Error(`Project ${jobData.projectId} not found`);

  const subdomain = deploymentSubdomain(project, jobData);
  const deploymentUrl = `https://${subdomain}.${env.DOMAIN_NAME}`;

  const deployment = await createDeployment({
    projectId: project.id,
    commitSha: jobData.commitSha,
    commitMessage: jobData.commitMessage,
    branch: jobData.branch,
    status: "queued",
    url: deploymentUrl,
    isPreview: Boolean(jobData.isPreview),
    prNumber: jobData.prNumber,
    prTitle: jobData.prTitle,
    rollbackFromDeploymentId: jobData.rollbackFromDeploymentId,
    triggeredBy: jobData.triggeredBy
  });

  await writeLog(
    deployment.id,
    `Deployment queued for ${project.repoOwner}/${project.repoName} @ ${jobData.commitSha}${jobData.commitMessage ? ` — ${jobData.commitMessage}` : ""}`
  );
  await writeLog(deployment.id, `Triggered by: ${jobData.triggeredBy}`);

  let workspacePath = "";
  let newContainerId = "";
  const isCancelled = (): Promise<boolean> => isCancelRequested(deployment.id);

  try {
    await setDeploymentStatus(deployment.id, "building");
    await markCommitPending(project, jobData.commitSha, deploymentUrl).catch(async (err) => {
      await writeLog(deployment.id, `Warning: cannot set pending status: ${err instanceof Error ? err.message : err}`);
    });

    await checkCancellation(deployment.id, "pre-clone");

    const decryptedToken = decryptSecret(project.encryptedAccessToken, env.NEXTAUTH_SECRET);
    const cloneUrl = createCloneUrl(project, decryptedToken);

    workspacePath = await mkdtemp(path.join(tmpdir(), `deploy-${deployment.id}-`));
    await writeLog(deployment.id, `Working directory: ${workspacePath}`);

    await runCommand(
      "git",
      ["clone", "--depth", "50", "--branch", jobData.branch, cloneUrl, workspacePath],
      {
        redactValues: [decryptedToken],
        onOutput: async (line) => { if (line) await writeLog(deployment.id, line); }
      }
    );

    await runCommand("git", ["checkout", jobData.commitSha], {
      cwd: workspacePath,
      onOutput: async (line) => { if (line) await writeLog(deployment.id, line); }
    }).catch(async () => {
      await runCommand("git", ["fetch", "--depth", "1", "origin", jobData.commitSha], { cwd: workspacePath });
      await runCommand("git", ["checkout", jobData.commitSha], { cwd: workspacePath });
    });

    await checkCancellation(deployment.id, "post-clone");

    // Resolve build root (monorepo support)
    const buildRoot = project.rootDirectory
      ? path.join(workspacePath, project.rootDirectory.replace(/^\/+/, ""))
      : workspacePath;

    const runtime = await ensureDockerAssets(buildRoot, {
      installCommand: project.installCommand,
      buildCommand: project.buildCommand,
      startCommand: project.startCommand,
      nodeVersion: project.nodeVersion
    });

    await writeLog(deployment.id, `Detected runtime: ${runtime.runtime} (${runtime.framework})`);
    if (project.installCommand) await writeLog(deployment.id, `Install: ${project.installCommand}`);
    if (project.buildCommand) await writeLog(deployment.id, `Build: ${project.buildCommand}`);
    if (project.startCommand) await writeLog(deployment.id, `Start: ${project.startCommand}`);
    if (project.rootDirectory) await writeLog(deployment.id, `Root directory: ${project.rootDirectory}`);

    const imageName = `project-${project.id}`;
    const imageTag = `${imageName}:${jobData.commitSha.slice(0, 12)}`;
    const latestTag = `${imageName}:latest`;

    await runCommand(
      "docker",
      ["build", "--build-arg", "BUILDKIT_INLINE_CACHE=1", "--cache-from", latestTag, "-t", imageTag, "-t", latestTag, "."],
      {
        cwd: buildRoot,
        onOutput: async (line) => { if (line) await writeLog(deployment.id, line); }
      }
    );

    await checkCancellation(deployment.id, "post-build");

    const assignedPort = await getPort({ port: portNumbers(15000, 25000) });
    const envVars = await getProjectEnvVars(project.id);
    const containerName = `paas-${project.slug}-${deployment.id.slice(0, 8)}`;

    const runArgs = ["run", "-d", "--name", containerName, "--memory=512m", "--cpus=0.5", "-p", `${assignedPort}:3000`];
    for (const [key, value] of Object.entries(envVars)) {
      runArgs.push("-e", `${key}=${value}`);
    }
    runArgs.push(imageTag);

    const containerOutput = await runCommand("docker", runArgs, {
      onOutput: async (line) => { if (line) await writeLog(deployment.id, line); }
    });

    newContainerId = containerOutput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1) as string;

    await updateDeployment(deployment.id, {
      status: "running",
      imageTag,
      containerId: newContainerId,
      containerName,
      port: assignedPort
    });

    await writeLog(deployment.id, `Container started: ${containerName} on port ${assignedPort}`);
    await writeLog(deployment.id, `Local URL: http://localhost:${assignedPort}`);

    await waitForContainer(deployment.id, assignedPort);
    await setDeploymentStatus(deployment.id, "switching");

    const previousDeployment = await findPreviousDeployment(project, jobData, deployment.id);

    await configureProjectRouting({ siteName: subdomain, subdomain, port: assignedPort, rootDomain: env.DOMAIN_NAME });

    if (!jobData.isPreview) {
      await setProjectActiveDeployment(project.id, deployment.id);
    }

    await setDeploymentStatus(deployment.id, "success", { url: deploymentUrl });

    if (previousDeployment?.containerId && previousDeployment.containerId !== newContainerId) {
      await writeLog(deployment.id, `Stopping previous container: ${previousDeployment.containerId}`);
      await stopAndRemoveContainer(previousDeployment.containerId);
      await setDeploymentStatus(previousDeployment.id, "stopped");
    }

    const startupLogs = await runCommand("docker", ["logs", "--tail", "100", newContainerId], { allowFailure: true });
    await appendDeploymentLogs(deployment.id, startupLogs.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));

    await markCommitResult(project, jobData.commitSha, "success", "Deployment successful", deploymentUrl).catch(async (err) => {
      await writeLog(deployment.id, `Warning: cannot set success status: ${err instanceof Error ? err.message : err}`);
    });

    await postPRComment(project, jobData, deploymentUrl, "success");

    await writeLog(deployment.id, `✅ Deployment succeeded! URL: ${deploymentUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown deployment error";
    const cancelled = message.startsWith("[cancelled]");

    await writeLog(deployment.id, cancelled ? "Deployment cancelled by user" : `Deployment failed: ${message}`);

    if (newContainerId) await stopAndRemoveContainer(newContainerId);

    await setDeploymentStatus(deployment.id, cancelled ? "cancelled" : "failed", { errorMessage: cancelled ? "Cancelled" : message });

    if (!cancelled) {
      await markCommitResult(project, jobData.commitSha, "failure", "Deployment failed", deploymentUrl).catch(() => {});
      await postPRComment(project, jobData, deploymentUrl, "failure", message);
    }

    if (!cancelled) throw error;
  } finally {
    if (workspacePath) {
      await rm(workspacePath, { recursive: true, force: true });
    }
  }
}

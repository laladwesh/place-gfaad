import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { Router } from "express";
import { z } from "zod";

import {
  createProjectSlug,
  createRepositoryWebhook,
  decryptSecret,
  deleteProject,
  deleteRepositoryWebhook,
  encryptSecret,
  enqueueDeployment,
  fetchUserRepos,
  getBranchHeadSha,
  getDeployment,
  getDeploymentLogs,
  getProject,
  getProjectEnvVars,
  listDeployments,
  listProjects,
  sanitizeBranchName,
  sanitizeEnvVars,
  saveProject,
  setProjectEnvVars,
  updateDeployment,
  setDeploymentStatus
} from "@platform/utils";

import type { AuthenticatedRequest } from "../types/express.js";
import { getBackendConfig } from "../config.js";
import { requireGithubAuth } from "../middleware/auth.js";
import { generateProjectAIInsights } from "../services/ai.js";

const execFileAsync = promisify(execFile);

const apiRouter = Router();

const deployBodySchema = z.object({
  commitSha: z.string().optional(),
  branch: z.string().optional()
});

const createProjectSchema = z.object({
  repoUrl: z.string().url(),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  branch: z.string().min(1),
  projectName: z.string().min(2).max(64),
  framework: z.string().optional(),
  rootDirectory: z.string().optional(),
  installCommand: z.string().optional(),
  buildCommand: z.string().optional(),
  startCommand: z.string().optional(),
  nodeVersion: z.string().optional(),
  autoDeploy: z.boolean().optional().default(true),
  setupWebhook: z.boolean().optional().default(true)
});

const updateProjectSchema = z.object({
  name: z.string().min(2).max(64).optional(),
  branch: z.string().min(1).optional(),
  framework: z.string().optional().nullable(),
  rootDirectory: z.string().optional().nullable(),
  installCommand: z.string().optional().nullable(),
  buildCommand: z.string().optional().nullable(),
  startCommand: z.string().optional().nullable(),
  nodeVersion: z.string().optional().nullable(),
  autoDeploy: z.boolean().optional()
});

const rollbackSchema = z.object({
  targetDeploymentId: z.string().optional()
});

const envVarsSchema = z.object({
  variables: z.record(z.string())
});

function toAuthRequest(request: unknown): AuthenticatedRequest {
  return request as AuthenticatedRequest;
}

function normalizeProjectOwnership<T extends { ownerLogin: string }>(
  ownerLogin: string,
  value: T | null
): T | null {
  if (!value || value.ownerLogin !== ownerLogin) {
    return null;
  }
  return value;
}

async function getUniqueProjectSlug(ownerLogin: string, requestedName: string): Promise<string> {
  const base = createProjectSlug(requestedName);
  const existingProjects = await listProjects(ownerLogin);
  const existingSlugs = new Set(existingProjects.map((project) => project.slug));
  if (!existingSlugs.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const next = `${base}-${index}`;
    if (!existingSlugs.has(next)) return next;
  }
  return `${base}-${Date.now()}`;
}

async function getDockerLogs(containerId: string, tail = 200): Promise<string[]> {
  try {
    const { stdout, stderr } = await execFileAsync("docker", [
      "logs",
      "--tail",
      String(tail),
      containerId
    ]);
    const output = [stdout, stderr].filter(Boolean).join("\n");
    return output
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown docker logs error";
    return [`[docker logs unavailable] ${message}`];
  }
}

// ─── REPOS ───────────────────────────────────────────────────────────────────

apiRouter.get("/repos", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const repos = await fetchUserRepos(authReq.githubToken);
    res.json({ repos });
  } catch (error) {
    next(error);
  }
});

// ─── PROJECTS ────────────────────────────────────────────────────────────────

apiRouter.get("/projects", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const projects = await listProjects(authReq.githubUser.login);
    res.json({ projects });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/projects", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const env = getBackendConfig();
    const body = createProjectSchema.parse(req.body);
    const slug = await getUniqueProjectSlug(authReq.githubUser.login, body.projectName);

    const project = await saveProject({
      id: randomUUID(),
      ownerLogin: authReq.githubUser.login,
      ownerAvatar: authReq.githubUser.avatarUrl,
      name: body.projectName,
      slug,
      repoOwner: body.repoOwner,
      repoName: body.repoName,
      repoUrl: body.repoUrl,
      branch: sanitizeBranchName(body.branch),
      encryptedAccessToken: encryptSecret(authReq.githubToken, env.NEXTAUTH_SECRET),
      framework: body.framework,
      rootDirectory: body.rootDirectory,
      installCommand: body.installCommand,
      buildCommand: body.buildCommand,
      startCommand: body.startCommand,
      nodeVersion: body.nodeVersion,
      autoDeploy: body.autoDeploy ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    if (body.setupWebhook) {
      try {
        const webhook = await createRepositoryWebhook({
          token: authReq.githubToken,
          owner: body.repoOwner,
          repo: body.repoName,
          webhookUrl: env.WEBHOOK_CALLBACK_URL,
          webhookSecret: env.WEBHOOK_SECRET,
          events: ["push", "pull_request"]
        });
        project.webhookId = webhook.id;
        await saveProject(project);
      } catch (webhookError) {
        console.error("[api] Webhook setup failed (non-fatal):", webhookError);
      }
    }

    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

apiRouter.patch("/projects/:projectId", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const body = updateProjectSchema.parse(req.body);
    const updated = await saveProject({
      ...project,
      ...(body.name !== undefined && { name: body.name }),
      ...(body.branch !== undefined && { branch: sanitizeBranchName(body.branch) }),
      ...(body.framework !== undefined && { framework: body.framework ?? undefined }),
      ...(body.rootDirectory !== undefined && { rootDirectory: body.rootDirectory ?? undefined }),
      ...(body.installCommand !== undefined && { installCommand: body.installCommand ?? undefined }),
      ...(body.buildCommand !== undefined && { buildCommand: body.buildCommand ?? undefined }),
      ...(body.startCommand !== undefined && { startCommand: body.startCommand ?? undefined }),
      ...(body.nodeVersion !== undefined && { nodeVersion: body.nodeVersion ?? undefined }),
      ...(body.autoDeploy !== undefined && { autoDeploy: body.autoDeploy })
    });

    res.json({ project: updated });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/projects/:projectId", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Stop all running containers for this project
    const deployments = await listDeployments(projectId, 200);
    for (const dep of deployments) {
      if (dep.containerId && ["running", "success", "switching"].includes(dep.status)) {
        try {
          await execFileAsync("docker", ["rm", "-f", dep.containerId]);
        } catch {
          // ignore
        }
      }
    }

    // Delete GitHub webhook if present
    if (project.webhookId) {
      try {
        const token = decryptSecret(project.encryptedAccessToken, getBackendConfig().NEXTAUTH_SECRET);
        await deleteRepositoryWebhook({
          token,
          owner: project.repoOwner,
          repo: project.repoName,
          hookId: project.webhookId
        });
      } catch {
        // ignore
      }
    }

    await deleteProject(projectId);
    res.json({ message: "Project deleted" });
  } catch (error) {
    next(error);
  }
});

// ─── WEBHOOK MANAGEMENT ──────────────────────────────────────────────────────

apiRouter.post("/projects/:projectId/refresh-webhook", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const env = getBackendConfig();
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const token = decryptSecret(project.encryptedAccessToken, env.NEXTAUTH_SECRET);

    // Delete old webhook
    if (project.webhookId) {
      try {
        await deleteRepositoryWebhook({
          token,
          owner: project.repoOwner,
          repo: project.repoName,
          hookId: project.webhookId
        });
      } catch {
        // ignore if already gone
      }
    }

    // Create new webhook pointing at current backend URL
    const webhook = await createRepositoryWebhook({
      token,
      owner: project.repoOwner,
      repo: project.repoName,
      webhookUrl: env.WEBHOOK_CALLBACK_URL,
      webhookSecret: env.WEBHOOK_SECRET,
      events: ["push", "pull_request"]
    });

    const updated = await saveProject({ ...project, webhookId: webhook.id });
    res.json({ project: updated, webhookUrl: env.WEBHOOK_CALLBACK_URL });
  } catch (error) {
    next(error);
  }
});

// ─── DEPLOY HOOK ─────────────────────────────────────────────────────────────

apiRouter.post("/projects/:projectId/deploy-hook/rotate", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const secret = randomBytes(24).toString("hex");
    const updated = await saveProject({ ...project, deployHookSecret: secret });
    res.json({ project: updated, deployHookSecret: secret });
  } catch (error) {
    next(error);
  }
});

// Public deploy hook URL — no auth, secret in path
apiRouter.post("/deploy-hook/:projectId/:secret", async (req, res, next) => {
  try {
    const { projectId, secret } = req.params;
    const project = await getProject(projectId!);
    if (!project || !project.deployHookSecret || project.deployHookSecret !== secret) {
      res.status(401).json({ error: "Invalid deploy hook" });
      return;
    }

    const env = getBackendConfig();
    const token = decryptSecret(project.encryptedAccessToken, env.NEXTAUTH_SECRET);
    const commitSha = await getBranchHeadSha({
      token,
      owner: project.repoOwner,
      repo: project.repoName,
      branch: project.branch
    });

    const job = await enqueueDeployment({
      projectId: project.id,
      commitSha,
      branch: project.branch,
      repoOwner: project.repoOwner,
      repoName: project.repoName,
      triggeredBy: "deploy-hook"
    });

    res.status(202).json({ message: "Deployment triggered via hook", jobId: job.id });
  } catch (error) {
    next(error);
  }
});

// ─── DEPLOY ───────────────────────────────────────────────────────────────────

apiRouter.post("/projects/:projectId/deploy", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const body = deployBodySchema.parse(req.body ?? {});
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const branch = sanitizeBranchName(body.branch ?? project.branch);
    const commitSha =
      body.commitSha ??
      (await getBranchHeadSha({
        token: decryptSecret(project.encryptedAccessToken, getBackendConfig().NEXTAUTH_SECRET),
        owner: project.repoOwner,
        repo: project.repoName,
        branch
      }));

    const job = await enqueueDeployment({
      projectId: project.id,
      commitSha,
      branch,
      repoOwner: project.repoOwner,
      repoName: project.repoName,
      triggeredBy: authReq.githubUser.login
    });

    res.status(202).json({ message: "Deployment job enqueued", jobId: job.id, commitSha, branch });
  } catch (error) {
    next(error);
  }
});

// ─── CANCEL DEPLOYMENT ───────────────────────────────────────────────────────

apiRouter.post("/deployments/:deploymentId/cancel", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const { deploymentId } = req.params;
    if (!deploymentId) {
      res.status(400).json({ error: "Missing deploymentId" });
      return;
    }

    const deployment = await getDeployment(deploymentId);
    if (!deployment) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(deployment.projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const cancellableStatuses = ["queued", "building", "running", "switching"];
    if (!cancellableStatuses.includes(deployment.status)) {
      res.status(400).json({ error: `Cannot cancel deployment in status: ${deployment.status}` });
      return;
    }

    // For queued deployments, mark cancelled immediately
    if (deployment.status === "queued") {
      await setDeploymentStatus(deploymentId, "cancelled");
      res.json({ message: "Deployment cancelled" });
      return;
    }

    // For active deployments, set a flag the worker will check
    await updateDeployment(deploymentId, { cancelRequested: true });
    res.json({ message: "Cancel requested — deployment will stop shortly" });
  } catch (error) {
    next(error);
  }
});

// ─── DEPLOYMENTS ─────────────────────────────────────────────────────────────

apiRouter.get("/projects/:projectId/deployments", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const deployments = await listDeployments(project.id, 50);
    res.json({ deployments });
  } catch (error) {
    next(error);
  }
});

// ─── ENV VARS ─────────────────────────────────────────────────────────────────

apiRouter.get("/projects/:projectId/env", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const variables = await getProjectEnvVars(project.id);
    res.json({ variables });
  } catch (error) {
    next(error);
  }
});

apiRouter.put("/projects/:projectId/env", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const payload = envVarsSchema.parse(req.body);
    const sanitized = sanitizeEnvVars(payload.variables);
    await setProjectEnvVars(project.id, sanitized);
    res.json({ variables: sanitized });
  } catch (error) {
    next(error);
  }
});

// ─── ROLLBACK ─────────────────────────────────────────────────────────────────

apiRouter.post("/projects/:projectId/rollback", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const body = rollbackSchema.parse(req.body ?? {});
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const deployments = await listDeployments(project.id, 100);
    const successfulDeployments = deployments.filter((d) => d.status === "success");

    const target = body.targetDeploymentId
      ? successfulDeployments.find((d) => d.id === body.targetDeploymentId)
      : successfulDeployments.find((d) => d.id !== project.activeDeploymentId);

    if (!target) {
      res.status(400).json({ error: "No rollback target available" });
      return;
    }

    const job = await enqueueDeployment({
      projectId: project.id,
      commitSha: target.commitSha,
      branch: target.branch,
      repoOwner: project.repoOwner,
      repoName: project.repoName,
      triggeredBy: authReq.githubUser.login,
      rollbackFromDeploymentId: target.id
    });

    res.status(202).json({ message: "Rollback queued", rollbackTo: target.id, jobId: job.id });
  } catch (error) {
    next(error);
  }
});

// ─── LOGS ─────────────────────────────────────────────────────────────────────

apiRouter.get("/deployments/:deploymentId/logs", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const { deploymentId } = req.params;
    if (!deploymentId) {
      res.status(400).json({ error: "Missing deploymentId" });
      return;
    }

    const deployment = await getDeployment(deploymentId);
    if (!deployment) {
      res.status(404).json({ error: "Deployment not found" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(deployment.projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const storedLogs = await getDeploymentLogs(deployment.id, 1000);
    const liveDockerLogs =
      deployment.containerId && deployment.status === "success"
        ? await getDockerLogs(deployment.containerId, 200)
        : [];

    res.json({ deploymentId: deployment.id, status: deployment.status, logs: [...storedLogs, ...liveDockerLogs] });
  } catch (error) {
    next(error);
  }
});

// ─── AI INSIGHTS ──────────────────────────────────────────────────────────────

apiRouter.get("/projects/:projectId/ai-insights", requireGithubAuth, async (req, res, next) => {
  try {
    const authReq = toAuthRequest(req);
    const { projectId } = req.params;
    if (!projectId) {
      res.status(400).json({ error: "Missing projectId" });
      return;
    }

    const project = normalizeProjectOwnership(
      authReq.githubUser.login,
      await getProject(projectId)
    );
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const deployments = await listDeployments(project.id, 30);
    const latestDeployment = deployments[0];
    const latestLogs = latestDeployment ? await getDeploymentLogs(latestDeployment.id, 300) : [];

    const insights = await generateProjectAIInsights({
      project: {
        name: project.name,
        repoOwner: project.repoOwner,
        repoName: project.repoName,
        branch: project.branch,
        slug: project.slug
      },
      deployments,
      recentLogs: latestLogs
    });

    res.json(insights);
  } catch (error) {
    next(error);
  }
});

export { apiRouter };

import { Router } from "express";

import {
  enqueueDeployment,
  findProjectByRepository,
  getCommitMessage,
  decryptSecret,
  sanitizeBranchName,
  verifyGitHubSignature
} from "@platform/utils";

import { getBackendConfig } from "../config.js";

interface PushPayload {
  ref: string;
  after: string;
  head_commit?: { message?: string };
  repository: {
    name: string;
    owner: { login?: string; name?: string };
  };
  sender?: { login?: string };
}

interface PullRequestPayload {
  action: string;
  number: number;
  repository: {
    name: string;
    owner: { login?: string; name?: string };
  };
  pull_request: {
    state: "open" | "closed";
    merged: boolean;
    title: string;
    head: { sha: string; ref: string };
    base: { ref: string };
  };
  sender?: { login?: string };
}

const ZERO_SHA = "0000000000000000000000000000000000000000";

const webhookRouter = Router();

function isBufferLike(value: unknown): value is Buffer {
  return Buffer.isBuffer(value);
}

webhookRouter.post("/", async (req, res, next) => {
  try {
    const env = getBackendConfig();
    if (!isBufferLike(req.body)) {
      res.status(400).json({ error: "Expected raw request body" });
      return;
    }

    const signature = req.header("x-hub-signature-256");
    const isValid = verifyGitHubSignature(req.body, signature, env.WEBHOOK_SECRET);
    if (!isValid) {
      console.warn("[webhook] Invalid signature from", req.ip);
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    const event = req.header("x-github-event");
    const payloadRaw = req.body.toString("utf8");
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;

    // ── push ──────────────────────────────────────────────────────────────────
    if (event === "push") {
      const pushPayload = payload as unknown as PushPayload;
      const repoOwner = pushPayload.repository.owner.login ?? pushPayload.repository.owner.name;
      const repoName = pushPayload.repository.name;
      const branch = sanitizeBranchName(pushPayload.ref);
      const commitSha = pushPayload.after;

      if (!repoOwner || !repoName || !branch || !commitSha) {
        res.status(400).json({ error: "Invalid push payload" });
        return;
      }

      // Skip branch-deletion events (after == all-zeros)
      if (commitSha === ZERO_SHA) {
        res.status(200).json({ message: "Branch deletion ignored" });
        return;
      }

      const project = await findProjectByRepository(repoOwner, repoName, branch);
      if (!project) {
        res.status(202).json({ message: "No matching project for repository/branch" });
        return;
      }

      // Respect per-project auto-deploy toggle (default true for old projects)
      if (project.autoDeploy === false) {
        res.status(202).json({ message: "Auto-deploy disabled for this project" });
        return;
      }

      // Fetch commit message for better UX in the dashboard
      let commitMessage: string | undefined;
      try {
        const token = decryptSecret(project.encryptedAccessToken, env.NEXTAUTH_SECRET);
        commitMessage = await getCommitMessage({ token, owner: repoOwner, repo: repoName, sha: commitSha });
      } catch {
        commitMessage = pushPayload.head_commit?.message?.split("\n")[0];
      }

      await enqueueDeployment({
        projectId: project.id,
        commitSha,
        commitMessage,
        branch,
        repoOwner: project.repoOwner,
        repoName: project.repoName,
        triggeredBy: pushPayload.sender?.login ?? "webhook"
      });

      console.log(`[webhook] push → queued deploy for ${project.name} @ ${commitSha.slice(0, 8)}`);
      res.status(202).json({ message: "Push deployment queued", projectId: project.id, branch, commitSha });
      return;
    }

    // ── pull_request ──────────────────────────────────────────────────────────
    if (event === "pull_request") {
      const prPayload = payload as unknown as PullRequestPayload;
      const deployableActions = new Set(["opened", "reopened", "synchronize"]);
      if (!deployableActions.has(prPayload.action)) {
        res.status(200).json({ message: "PR action ignored" });
        return;
      }

      if (prPayload.pull_request.state !== "open" || prPayload.pull_request.merged) {
        res.status(200).json({ message: "PR is not open" });
        return;
      }

      const repoOwner = prPayload.repository.owner.login ?? prPayload.repository.owner.name;
      const repoName = prPayload.repository.name;
      const baseBranch = sanitizeBranchName(prPayload.pull_request.base.ref);

      if (!repoOwner || !repoName) {
        res.status(400).json({ error: "Invalid PR payload" });
        return;
      }

      const project = await findProjectByRepository(repoOwner, repoName, baseBranch);
      if (!project) {
        res.status(202).json({ message: "No matching project for PR preview" });
        return;
      }

      if (project.autoDeploy === false) {
        res.status(202).json({ message: "Auto-deploy disabled for this project" });
        return;
      }

      await enqueueDeployment({
        projectId: project.id,
        commitSha: prPayload.pull_request.head.sha,
        commitMessage: `PR #${prPayload.number}: ${prPayload.pull_request.title}`,
        branch: sanitizeBranchName(prPayload.pull_request.head.ref),
        repoOwner: project.repoOwner,
        repoName: project.repoName,
        triggeredBy: prPayload.sender?.login ?? "webhook",
        isPreview: true,
        prNumber: prPayload.number,
        prTitle: prPayload.pull_request.title
      });

      console.log(`[webhook] PR#${prPayload.number} → queued preview deploy for ${project.name}`);
      res.status(202).json({
        message: "Preview deployment queued",
        projectId: project.id,
        prNumber: prPayload.number,
        commitSha: prPayload.pull_request.head.sha
      });
      return;
    }

    res.status(200).json({ message: `Unhandled event: ${event}` });
  } catch (error) {
    next(error);
  }
});

export { webhookRouter };

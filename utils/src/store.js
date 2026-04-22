import { randomUUID } from "node:crypto";
import { getSharedEnv } from "./env.js";
import { normalizeGithubIdentifier } from "./security.js";
import { getRedisClient } from "./redis.js";
function projectKey(projectId) {
    return `project:${projectId}`;
}
function ownerProjectsKey(ownerLogin) {
    return `owner:${ownerLogin}:projects`;
}
function repoProjectsKey(owner, repo) {
    return `repo:${normalizeGithubIdentifier(owner)}/${normalizeGithubIdentifier(repo)}:projects`;
}
function repoBranchProjectKey(owner, repo, branch) {
    return `repo:${normalizeGithubIdentifier(owner)}/${normalizeGithubIdentifier(repo)}:${branch}:project`;
}
function deploymentKey(deploymentId) {
    return `deployment:${deploymentId}`;
}
function projectDeploymentsKey(projectId) {
    return `project:${projectId}:deployments`;
}
function deploymentLogsKey(deploymentId) {
    return `deployment:${deploymentId}:logs`;
}
function projectEnvVarsKey(projectId) {
    return `project:${projectId}:env`;
}
function parseJson(value) {
    if (!value) {
        return null;
    }
    return JSON.parse(value);
}
export async function saveProject(project) {
    const redis = getRedisClient();
    const normalizedProject = {
        ...project,
        ownerLogin: normalizeGithubIdentifier(project.ownerLogin),
        repoOwner: normalizeGithubIdentifier(project.repoOwner),
        repoName: normalizeGithubIdentifier(project.repoName),
        branch: project.branch.trim(),
        updatedAt: new Date().toISOString()
    };
    await redis
        .multi()
        .set(projectKey(normalizedProject.id), JSON.stringify(normalizedProject))
        .sadd(ownerProjectsKey(normalizedProject.ownerLogin), normalizedProject.id)
        .sadd(repoProjectsKey(normalizedProject.repoOwner, normalizedProject.repoName), normalizedProject.id)
        .set(repoBranchProjectKey(normalizedProject.repoOwner, normalizedProject.repoName, normalizedProject.branch), normalizedProject.id)
        .exec();
    return normalizedProject;
}
export async function getProject(projectId) {
    const redis = getRedisClient();
    const value = await redis.get(projectKey(projectId));
    return parseJson(value);
}
export async function listProjects(ownerLogin) {
    const redis = getRedisClient();
    const normalizedOwner = normalizeGithubIdentifier(ownerLogin);
    const ids = await redis.smembers(ownerProjectsKey(normalizedOwner));
    if (ids.length === 0) {
        return [];
    }
    const raw = await redis.mget(ids.map((id) => projectKey(id)));
    return raw
        .map((entry) => parseJson(entry))
        .filter((project) => Boolean(project));
}
export async function findProjectByRepository(owner, repo, branch) {
    const redis = getRedisClient();
    const normalizedOwner = normalizeGithubIdentifier(owner);
    const normalizedRepo = normalizeGithubIdentifier(repo);
    if (branch) {
        const exactProjectId = await redis.get(repoBranchProjectKey(normalizedOwner, normalizedRepo, branch));
        if (exactProjectId) {
            return getProject(exactProjectId);
        }
    }
    const candidateIds = await redis.smembers(repoProjectsKey(normalizedOwner, normalizedRepo));
    if (candidateIds.length === 0) {
        return null;
    }
    const candidates = await Promise.all(candidateIds.map((id) => getProject(id)));
    const projects = candidates.filter((project) => Boolean(project));
    if (projects.length === 0) {
        return null;
    }
    if (!branch) {
        return projects[0] ?? null;
    }
    return projects.find((project) => project.branch === branch) ?? projects[0] ?? null;
}
export async function createDeployment(input) {
    const now = new Date().toISOString();
    const deployment = {
        ...input,
        id: input.id ?? randomUUID(),
        createdAt: now,
        updatedAt: now
    };
    await saveDeployment(deployment);
    return deployment;
}
export async function saveDeployment(deployment) {
    const redis = getRedisClient();
    await redis
        .multi()
        .set(deploymentKey(deployment.id), JSON.stringify(deployment))
        .zadd(projectDeploymentsKey(deployment.projectId), Date.parse(deployment.createdAt), deployment.id)
        .exec();
}
export async function getDeployment(deploymentId) {
    const redis = getRedisClient();
    const value = await redis.get(deploymentKey(deploymentId));
    return parseJson(value);
}
export async function listDeployments(projectId, limit = 20) {
    const redis = getRedisClient();
    const ids = await redis.zrevrange(projectDeploymentsKey(projectId), 0, limit - 1);
    if (ids.length === 0) {
        return [];
    }
    const raw = await redis.mget(ids.map((id) => deploymentKey(id)));
    return raw
        .map((entry) => parseJson(entry))
        .filter((deployment) => Boolean(deployment));
}
export async function updateDeployment(deploymentId, updates) {
    const current = await getDeployment(deploymentId);
    if (!current) {
        throw new Error(`Deployment ${deploymentId} not found`);
    }
    const updated = {
        ...current,
        ...updates,
        id: current.id,
        updatedAt: new Date().toISOString()
    };
    await saveDeployment(updated);
    return updated;
}
export async function setDeploymentStatus(deploymentId, status, updates) {
    return updateDeployment(deploymentId, {
        ...updates,
        status
    });
}
export async function appendDeploymentLog(deploymentId, line) {
    const redis = getRedisClient();
    const env = getSharedEnv();
    await redis
        .multi()
        .rpush(deploymentLogsKey(deploymentId), line)
        .ltrim(deploymentLogsKey(deploymentId), -env.DEPLOY_LOG_LINES, -1)
        .exec();
}
export async function appendDeploymentLogs(deploymentId, lines) {
    for (const line of lines) {
        await appendDeploymentLog(deploymentId, line);
    }
}
export async function getDeploymentLogs(deploymentId, limit = 500) {
    const redis = getRedisClient();
    return redis.lrange(deploymentLogsKey(deploymentId), -limit, -1);
}
export async function setProjectActiveDeployment(projectId, activeDeploymentId) {
    const project = await getProject(projectId);
    if (!project) {
        throw new Error(`Project ${projectId} not found`);
    }
    project.activeDeploymentId = activeDeploymentId;
    project.updatedAt = new Date().toISOString();
    return saveProject(project);
}
export async function setProjectEnvVars(projectId, variables) {
    const redis = getRedisClient();
    await redis.del(projectEnvVarsKey(projectId));
    const entries = Object.entries(variables);
    if (entries.length === 0) {
        return;
    }
    await redis.hset(projectEnvVarsKey(projectId), variables);
}
export async function getProjectEnvVars(projectId) {
    const redis = getRedisClient();
    return redis.hgetall(projectEnvVarsKey(projectId));
}
//# sourceMappingURL=store.js.map
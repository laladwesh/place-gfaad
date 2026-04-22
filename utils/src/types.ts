export type DeploymentStatus =
  | "queued"
  | "building"
  | "running"
  | "switching"
  | "success"
  | "failed"
  | "stopped"
  | "cancelled";

export interface Project {
  id: string;
  ownerLogin: string;
  ownerAvatar?: string;
  name: string;
  slug: string;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  branch: string;
  encryptedAccessToken: string;
  webhookId?: number;
  activeDeploymentId?: string;
  // Build configuration
  framework?: string;
  rootDirectory?: string;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  nodeVersion?: string;
  // Deployment settings
  autoDeploy: boolean;
  deployHookSecret?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  commitSha: string;
  commitMessage?: string;
  branch: string;
  status: DeploymentStatus;
  imageTag?: string;
  containerId?: string;
  containerName?: string;
  port?: number;
  url: string;
  isPreview: boolean;
  prNumber?: number;
  prTitle?: string;
  rollbackFromDeploymentId?: string;
  errorMessage?: string;
  triggeredBy?: string;
  cancelRequested?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeployJobData {
  projectId: string;
  commitSha: string;
  commitMessage?: string;
  branch: string;
  repoOwner: string;
  repoName: string;
  triggeredBy: string;
  isPreview?: boolean;
  prNumber?: number;
  prTitle?: string;
  rollbackFromDeploymentId?: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  description?: string;
  owner: {
    login: string;
    avatar_url?: string;
  };
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url?: string;
}

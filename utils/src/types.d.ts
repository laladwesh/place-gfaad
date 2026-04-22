export type DeploymentStatus = "queued" | "building" | "running" | "switching" | "success" | "failed" | "stopped";
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
    createdAt: string;
    updatedAt: string;
}
export interface Deployment {
    id: string;
    projectId: string;
    commitSha: string;
    branch: string;
    status: DeploymentStatus;
    imageTag?: string;
    containerId?: string;
    containerName?: string;
    port?: number;
    url: string;
    isPreview: boolean;
    prNumber?: number;
    rollbackFromDeploymentId?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}
export interface DeployJobData {
    projectId: string;
    commitSha: string;
    branch: string;
    repoOwner: string;
    repoName: string;
    triggeredBy: string;
    isPreview?: boolean;
    prNumber?: number;
    rollbackFromDeploymentId?: string;
}
export interface GitHubRepository {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    html_url: string;
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
//# sourceMappingURL=types.d.ts.map
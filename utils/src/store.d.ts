import type { Deployment, DeploymentStatus, Project } from "./types.js";
export declare function saveProject(project: Project): Promise<Project>;
export declare function getProject(projectId: string): Promise<Project | null>;
export declare function listProjects(ownerLogin: string): Promise<Project[]>;
export declare function findProjectByRepository(owner: string, repo: string, branch?: string): Promise<Project | null>;
export declare function createDeployment(input: Omit<Deployment, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
}): Promise<Deployment>;
export declare function saveDeployment(deployment: Deployment): Promise<void>;
export declare function getDeployment(deploymentId: string): Promise<Deployment | null>;
export declare function listDeployments(projectId: string, limit?: number): Promise<Deployment[]>;
export declare function updateDeployment(deploymentId: string, updates: Partial<Deployment>): Promise<Deployment>;
export declare function setDeploymentStatus(deploymentId: string, status: DeploymentStatus, updates?: Partial<Deployment>): Promise<Deployment>;
export declare function appendDeploymentLog(deploymentId: string, line: string): Promise<void>;
export declare function appendDeploymentLogs(deploymentId: string, lines: string[]): Promise<void>;
export declare function getDeploymentLogs(deploymentId: string, limit?: number): Promise<string[]>;
export declare function setProjectActiveDeployment(projectId: string, activeDeploymentId: string): Promise<Project>;
export declare function setProjectEnvVars(projectId: string, variables: Record<string, string>): Promise<void>;
export declare function getProjectEnvVars(projectId: string): Promise<Record<string, string>>;
//# sourceMappingURL=store.d.ts.map
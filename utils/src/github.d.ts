import type { GitHubRepository, GitHubUser } from "./types.js";
interface CreateWebhookInput {
    token: string;
    owner: string;
    repo: string;
    webhookUrl: string;
    webhookSecret: string;
    events: string[];
}
interface CommitStatusInput {
    token: string;
    owner: string;
    repo: string;
    sha: string;
    state: "pending" | "success" | "failure" | "error";
    description: string;
    targetUrl?: string;
    context?: string;
}
export declare function fetchGithubUser(token: string): Promise<GitHubUser>;
export declare function fetchUserRepos(token: string): Promise<GitHubRepository[]>;
export declare function getBranchHeadSha(input: {
    token: string;
    owner: string;
    repo: string;
    branch: string;
}): Promise<string>;
export declare function createRepositoryWebhook(input: CreateWebhookInput): Promise<{
    id: number;
}>;
export declare function setCommitStatus(input: CommitStatusInput): Promise<void>;
export {};
//# sourceMappingURL=github.d.ts.map
export declare function createProjectSlug(input: string): string;
export declare function normalizeGithubIdentifier(value: string): string;
export declare function sanitizeBranchName(value: string): string;
export declare function sanitizeEnvVars(variables: Record<string, string>): Record<string, string>;
export declare function verifyGitHubSignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean;
//# sourceMappingURL=security.d.ts.map
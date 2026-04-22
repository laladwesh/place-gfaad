import { createHmac, timingSafeEqual } from "node:crypto";

import slugify from "slugify";

export function createProjectSlug(input: string): string {
  const slug = slugify(input, {
    lower: true,
    strict: true,
    trim: true
  });

  const safe = slug.slice(0, 48);
  if (safe) {
    return safe;
  }

  return `project-${Date.now()}`;
}

export function normalizeGithubIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function sanitizeBranchName(value: string): string {
  return value.replace(/^refs\/heads\//, "").trim();
}

export function sanitizeEnvVars(
  variables: Record<string, string>
): Record<string, string> {
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(variables)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      continue;
    }

    output[key] = String(value).slice(0, 4096);
  }

  return output;
}

export function verifyGitHubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signatureHeader, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

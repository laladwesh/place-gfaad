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

const GITHUB_API = "https://api.github.com";

function createHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "onawie-platform"
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API ${response.status}: ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function fetchGithubUser(token: string): Promise<GitHubUser> {
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: createHeaders(token)
  });

  return parseResponse<GitHubUser>(response);
}

export async function fetchUserRepos(token: string): Promise<GitHubRepository[]> {
  const response = await fetch(
    `${GITHUB_API}/user/repos?sort=updated&per_page=100&type=all`,
    {
      headers: createHeaders(token)
    }
  );

  return parseResponse<GitHubRepository[]>(response);
}

export async function getBranchHeadSha(input: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}): Promise<string> {
  const { token, owner, repo, branch } = input;
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`,
    {
      headers: createHeaders(token)
    }
  );

  const payload = await parseResponse<{ sha: string }>(response);
  return payload.sha;
}

export async function getCommitMessage(input: {
  token: string;
  owner: string;
  repo: string;
  sha: string;
}): Promise<string> {
  const { token, owner, repo, sha } = input;
  try {
    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/commits/${sha}`, {
      headers: createHeaders(token)
    });
    const data = await parseResponse<{ commit: { message: string } }>(response);
    return data.commit.message.split("\n")[0] ?? "";
  } catch {
    return "";
  }
}

export async function createRepositoryWebhook(input: CreateWebhookInput): Promise<{
  id: number;
}> {
  const { token, owner, repo, webhookUrl, webhookSecret, events } = input;
  const createResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/hooks`,
    {
      method: "POST",
      headers: {
        ...createHeaders(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "web",
        active: true,
        events,
        config: {
          url: webhookUrl,
          content_type: "json",
          secret: webhookSecret
        }
      })
    }
  );

  if (createResponse.ok) {
    const created = (await createResponse.json()) as { id: number };
    return { id: created.id };
  }

  if (createResponse.status === 422) {
    const hooksResponse = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/hooks`,
      {
        headers: createHeaders(token)
      }
    );

    const hooks = await parseResponse<Array<{ id: number; config?: { url?: string } }>>(
      hooksResponse
    );
    const existing = hooks.find((hook) => hook.config?.url === webhookUrl);
    if (existing) {
      return { id: existing.id };
    }
  }

  const body = await createResponse.text();
  throw new Error(
    `Unable to create webhook for ${owner}/${repo}: ${createResponse.status} ${body}`
  );
}

export async function deleteRepositoryWebhook(input: {
  token: string;
  owner: string;
  repo: string;
  hookId: number;
}): Promise<void> {
  const { token, owner, repo, hookId } = input;
  await fetch(`${GITHUB_API}/repos/${owner}/${repo}/hooks/${hookId}`, {
    method: "DELETE",
    headers: createHeaders(token)
  });
}

export async function setCommitStatus(input: CommitStatusInput): Promise<void> {
  const {
    token,
    owner,
    repo,
    sha,
    state,
    description,
    targetUrl,
    context = "onawie/deploy"
  } = input;

  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/statuses/${sha}`, {
    method: "POST",
    headers: {
      ...createHeaders(token),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      state,
      description,
      target_url: targetUrl,
      context
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Unable to set commit status: ${response.status} ${body}`);
  }
}

export async function createOrUpdatePRComment(input: {
  token: string;
  owner: string;
  repo: string;
  prNumber: number;
  body: string;
  markerTag: string;
}): Promise<void> {
  const { token, owner, repo, prNumber, body, markerTag } = input;
  const headers = { ...createHeaders(token), "Content-Type": "application/json" };

  const listResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`,
    { headers }
  );
  if (!listResponse.ok) return;

  const comments = (await listResponse.json()) as Array<{ id: number; body?: string }>;
  const existing = comments.find((c) => c.body?.includes(markerTag));

  if (existing) {
    await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ body })
    });
  } else {
    await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body })
    });
  }
}

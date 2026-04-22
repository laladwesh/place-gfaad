const GITHUB_API = "https://api.github.com";
function createHeaders(token) {
    return {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mini-paas-platform"
    };
}
async function parseResponse(response) {
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub API ${response.status}: ${errorText}`);
    }
    return (await response.json());
}
export async function fetchGithubUser(token) {
    const response = await fetch(`${GITHUB_API}/user`, {
        headers: createHeaders(token)
    });
    return parseResponse(response);
}
export async function fetchUserRepos(token) {
    const response = await fetch(`${GITHUB_API}/user/repos?sort=updated&per_page=100&type=all`, {
        headers: createHeaders(token)
    });
    return parseResponse(response);
}
export async function getBranchHeadSha(input) {
    const { token, owner, repo, branch } = input;
    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`, {
        headers: createHeaders(token)
    });
    const payload = await parseResponse(response);
    return payload.sha;
}
export async function createRepositoryWebhook(input) {
    const { token, owner, repo, webhookUrl, webhookSecret, events } = input;
    const createResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/hooks`, {
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
    });
    if (createResponse.ok) {
        const created = (await createResponse.json());
        return { id: created.id };
    }
    if (createResponse.status === 422) {
        const hooksResponse = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/hooks`, {
            headers: createHeaders(token)
        });
        const hooks = await parseResponse(hooksResponse);
        const existing = hooks.find((hook) => hook.config?.url === webhookUrl);
        if (existing) {
            return { id: existing.id };
        }
    }
    const body = await createResponse.text();
    throw new Error(`Unable to create webhook for ${owner}/${repo}: ${createResponse.status} ${body}`);
}
export async function setCommitStatus(input) {
    const { token, owner, repo, sha, state, description, targetUrl, context = "mini-paas/deploy" } = input;
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
//# sourceMappingURL=github.js.map
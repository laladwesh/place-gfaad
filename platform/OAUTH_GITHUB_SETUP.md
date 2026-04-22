# GitHub OAuth + Webhook Setup

This document covers:

- Creating GitHub OAuth App
- Generating Client ID / Client Secret
- Setting callback URL for NextAuth
- Verifying OAuth login
- Testing webhook-driven deploys locally with ngrok

## 1. Create GitHub OAuth App

1. Open GitHub -> **Settings** -> **Developer settings**.
2. Go to **OAuth Apps**.
3. Click **New OAuth App**.
4. Fill fields:
   - **Application name**: `Mini PaaS`
   - **Homepage URL**: `http://localhost:3000` (local) or production domain
   - **Authorization callback URL**:
     - Local: `http://localhost:3000/api/auth/callback/github`
     - Production: `https://apps.example.com/api/auth/callback/github`
5. Click **Register application**.

## 2. Generate Client Secret

In created OAuth App:

1. Copy **Client ID**.
2. Click **Generate a new client secret**.
3. Copy and store securely.

Put values in `.env`:

```env
GITHUB_CLIENT_ID=<client-id>
GITHUB_CLIENT_SECRET=<client-secret>
NEXTAUTH_SECRET=<long-random-secret>
NEXTAUTH_URL=http://localhost:3000
```

Generate `NEXTAUTH_SECRET` example:

```bash
openssl rand -base64 32
```

## 3. Required GitHub OAuth Scopes

The app requests:

- `read:user`
- `user:email`
- `repo`
- `admin:repo_hook`
- `repo:status`

These are needed for:

- private repo listing/deployments
- webhook creation
- commit status updates

## 4. Validate OAuth Login

1. Start frontend and backend.
2. Open `http://localhost:3000`.
3. Click **Continue with GitHub**.
4. Confirm redirect back to `/dashboard`.
5. Confirm repos load in dashboard.

## 5. Automatic Webhook Creation

When you create a project, backend creates webhook using GitHub API:

`POST /repos/{owner}/{repo}/hooks`

Payload:

```json
{
  "name": "web",
  "active": true,
  "events": ["push", "pull_request"],
  "config": {
    "url": "https://yourdomain.com/api/webhook",
    "content_type": "json",
    "secret": "WEBHOOK_SECRET"
  }
}
```

## 6. Local Webhook Testing with ngrok

Because GitHub cannot call localhost directly, expose backend with ngrok.

1. Run backend (`http://localhost:4000`).
2. Start tunnel:

```bash
ngrok http 4000
```

3. Copy generated HTTPS URL, e.g. `https://abc123.ngrok.io`.
4. Set in `.env`:

```env
BACKEND_PUBLIC_URL=https://abc123.ngrok.io
WEBHOOK_SECRET=<same-secret-used-for-signature-validation>
```

5. Restart backend.
6. Create a new project from dashboard so webhook is created with updated URL.
7. Push commit to selected repo branch.
8. Check:
   - backend webhook logs
   - worker deployment logs
   - GitHub webhook delivery tab

## 7. Signature Verification Notes

Webhook endpoint validates:

- Header: `x-hub-signature-256`
- Hash method: `sha256`
- Compare with HMAC(secret, rawBody)

If invalid, webhook returns `401` and does not enqueue deployment.

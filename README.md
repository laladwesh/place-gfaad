# Mini PaaS Platform

Mini PaaS similar to Vercel/Render:

- GitHub OAuth login
- Repository selection
- Automatic deployment in Docker
- Webhook-only redeploy on new push
- Live project subdomain routing via NGINX
- Runtime allow-list: Node/MERN/React/Next.js/HTML only
- Optional AI deployment insights with Gemini (fallback to local rules)

This README is a practical runbook in this order:

1. Run locally
2. Deploy to production

## Project Layout

```text
.
├── frontend/   # Next.js UI + NextAuth
├── backend/    # Express APIs + webhook endpoint
├── worker/     # BullMQ deployment engine
├── nginx/      # NGINX config automation helpers
├── utils/      # Shared queue/store/github/security code
└── platform/   # Compose and infra docs
```

## What You Need

- Node.js 20+
- npm 10+
- Docker engine running
- Redis
- NGINX (required for real routing)
- GitHub OAuth App credentials

Recommended for full local parity: Linux or WSL2 Ubuntu.

## Environment Variables

Copy template:

```bash
cp .env.example .env
```

Fill these values:

```env
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

REDIS_URL=redis://localhost:6379

DOMAIN_NAME=apps.example.com
WEBHOOK_SECRET=
BACKEND_PUBLIC_URL=https://your-public-backend-url
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000

PORT=4000
DEPLOY_ROOT=/var/lib/mini-paas/deployments
NGINX_SITES_AVAILABLE_DIR=/etc/nginx/sites-available
NGINX_SITES_ENABLED_DIR=/etc/nginx/sites-enabled
NGINX_BIN=nginx
DEPLOY_LOG_LINES=2000

GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

ORACLE_SSH_HOST=
ORACLE_SSH_PORT=22
ORACLE_SSH_USER=opc
ORACLE_SSH_PRIVATE_KEY=C:/Users/your-user/.ssh/oracle_linux_key
ORACLE_REMOTE_PATH=/opt/mini-paas
ORACLE_GIT_REPO_URL=
ORACLE_GIT_BRANCH=main
ORACLE_SYSTEMD_UNITS=mini-paas-backend mini-paas-worker mini-paas-frontend
```

Generate secure random secrets:

```bash
openssl rand -base64 32
```

## Local Setup (First)

### 1. Install dependencies

```bash
npm install
```

### 2. Start Redis

```bash
docker run -d --name mini-paas-redis -p 6379:6379 redis:7-alpine
```

### 3. Configure GitHub OAuth App for local

Create GitHub OAuth app with:

- Homepage URL: `http://localhost:3000`
- Callback URL: `http://localhost:3000/api/auth/callback/github`

Then set in `.env`:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL=http://localhost:3000`

### 4. Prepare NGINX for local routing

If using Ubuntu/WSL:

```bash
sudo apt update
sudo apt install -y nginx
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
sudo systemctl enable nginx
sudo systemctl start nginx
sudo nginx -t
```

### 5. Start frontend + backend + worker

```bash
npm run dev
```

Services:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- Worker: background deployment consumer

### 6. Expose backend webhook endpoint publicly

GitHub must reach `/api/webhook` from the internet.

Example with ngrok:

```bash
ngrok http 4000
```

Set ngrok URL in `.env`:

```env
BACKEND_PUBLIC_URL=https://<ngrok-id>.ngrok.io
WEBHOOK_SECRET=<same-secret-used-for-github-webhook-signature>
```

Restart app processes after editing `.env`.

### 7. Local functional test (end-to-end)

1. Open frontend and login with GitHub.
2. Select repo and branch.
3. Click Deploy.
4. Confirm project is created and webhook is auto-created.
5. Confirm worker starts build and container.
6. Push a new commit to the same branch.
7. Confirm webhook triggers automatic redeploy.

Useful checks:

```bash
curl http://localhost:4000/health
docker ps
```

### 8. If local deploy fails on NGINX step

The worker requires NGINX test and reload commands.

- Verify `NGINX_BIN` points to a valid nginx executable.
- Verify `NGINX_SITES_AVAILABLE_DIR` and `NGINX_SITES_ENABLED_DIR` are writable.
- Verify `sudo nginx -t` is successful.

If you only want to test queue/build logic (not live routing), set a temporary override for local testing:

```env
NGINX_BIN=echo
NGINX_SITES_AVAILABLE_DIR=./tmp/nginx/sites-available
NGINX_SITES_ENABLED_DIR=./tmp/nginx/sites-enabled
```

This bypasses real NGINX reload while still validating most of the deploy pipeline.

## Windows Laptop -> Oracle Linux Server (SSH)

If you develop on Windows and deploy to an Oracle Linux server, keep all server details in `.env` and use the built-in PowerShell helper.

Set these values in `.env`:

```env
ORACLE_SSH_HOST=<public-ip-or-dns>
ORACLE_SSH_PORT=22
ORACLE_SSH_USER=opc
ORACLE_SSH_PRIVATE_KEY=C:/Users/<you>/.ssh/oracle_linux_key
ORACLE_REMOTE_PATH=/opt/mini-paas
ORACLE_GIT_REPO_URL=https://github.com/<owner>/<repo>.git
ORACLE_GIT_BRANCH=main
ORACLE_SYSTEMD_UNITS=mini-paas-backend mini-paas-worker mini-paas-frontend
```

Deploy from Windows:

```bash
npm run deploy:oracle
```

Useful variants:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File ./platform/deploy-oracle.ps1 -SkipBuild
powershell -NoProfile -ExecutionPolicy Bypass -File ./platform/deploy-oracle.ps1 -SkipRestart
```

## Production Setup (Then)

### 1. Provision server

Use Ubuntu 22.04/24.04 or Oracle Linux 8/9 with:

- Public static IP
- Domain control (DNS)
- Open ports 80/443

### 2. DNS records

Assume root domain `apps.example.com`.

Create:

- `A` record: `apps.example.com` -> server IP
- `A` record: `api.apps.example.com` -> server IP
- `A` wildcard: `*.apps.example.com` -> server IP

### 3. Install system dependencies

Install Docker, NGINX, Redis, Node.js on server.

Follow full step-by-step:

- [platform/SETUP_UBUNTU.md](platform/SETUP_UBUNTU.md)
- [platform/SETUP_ORACLE_LINUX.md](platform/SETUP_ORACLE_LINUX.md)

### 4. Configure production OAuth

Set GitHub OAuth app values:

- Homepage URL: `https://apps.example.com`
- Callback URL: `https://apps.example.com/api/auth/callback/github`

Complete flow and scopes:

- [platform/OAUTH_GITHUB_SETUP.md](platform/OAUTH_GITHUB_SETUP.md)

### 5. Configure production `.env`

Minimum important values:

```env
NEXTAUTH_URL=https://apps.example.com
BACKEND_PUBLIC_URL=https://api.apps.example.com
NEXT_PUBLIC_BACKEND_URL=https://api.apps.example.com
DOMAIN_NAME=apps.example.com
REDIS_URL=redis://127.0.0.1:6379
```

Keep `WEBHOOK_SECRET` and `NEXTAUTH_SECRET` long and random.

### 6. Build and run services

```bash
npm install
npm run build
```

Run with systemd services for:

- frontend
- backend
- worker

Systemd example steps are in [platform/SETUP_UBUNTU.md](platform/SETUP_UBUNTU.md).

### 7. Configure edge NGINX hosts

Create base NGINX config for:

- `apps.example.com` -> frontend `127.0.0.1:3000`
- `api.apps.example.com` -> backend `127.0.0.1:4000`

Project subdomains are generated dynamically by worker automation.

### 8. Enable TLS

Use certbot with NGINX for `apps.example.com` and `api.apps.example.com`.

For wildcard (`*.apps.example.com`), use DNS challenge.

### 9. Production validation checklist

```bash
curl http://127.0.0.1:4000/health
redis-cli ping
sudo nginx -t
docker ps
```

Then test user flow:

1. Login
2. Create project
3. Verify first deploy
4. Push commit
5. Verify auto-redeploy and updated live URL target

## API Endpoints

- `GET /health`
- `GET /api/repos`
- `GET /api/projects`
- `POST /api/projects`
- `POST /api/projects/:projectId/deploy`
- `GET /api/projects/:projectId/deployments`
- `POST /api/projects/:projectId/rollback`
- `GET /api/projects/:projectId/env`
- `PUT /api/projects/:projectId/env`
- `GET /api/deployments/:deploymentId/logs`
- `GET /api/projects/:projectId/ai-insights`
- `POST /api/webhook`

## Deployment and Safety Notes

- Webhook redeploys are event-driven (no polling loops).
- Webhook signatures are verified with HMAC SHA-256 (`x-hub-signature-256`).
- User apps are run in Docker with resource limits (`--memory=512m --cpus=0.5`).
- Unsupported stacks are rejected at deploy-time (Python/Java/Go disabled).
- Zero-downtime deploy flow:
   1. start new container
   2. health-check new container
   3. update NGINX target
   4. stop previous container

## Optional: Containerized Platform Stack

There is a compose file at [platform/docker-compose.yml](platform/docker-compose.yml).

Use it only if host Docker socket and host NGINX directories are available and correctly mounted.


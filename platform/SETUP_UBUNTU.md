# Ubuntu Production Setup Guide

This guide configures an Ubuntu server for the mini PaaS stack:

- Docker (for user deployments and optional service containers)
- NGINX (edge reverse proxy and dynamic per-project virtual hosts)
- Redis (BullMQ queue and metadata storage)
- Wildcard domain routing
- Optional SSL with Let's Encrypt

## 1. System Preparation

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release git
```

## 2. Install Docker Engine

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and log back in once to apply Docker group membership.

## 3. Install NGINX

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

Required site folders (usually already present on Ubuntu):

```bash
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
```

## 4. Install Redis

```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

Optional hardening in `/etc/redis/redis.conf`:

- `bind 127.0.0.1`
- `protected-mode yes`
- `requirepass <strong-password>` (if used, include password in `REDIS_URL`)

Restart:

```bash
sudo systemctl restart redis-server
```

## 5. DNS and Wildcard Domain

Assume root domain `apps.example.com`.

Create DNS records:

- `A` record: `apps.example.com` -> server public IP
- `A` wildcard: `*.apps.example.com` -> same public IP

This enables subdomains like `project-a.apps.example.com` and `pr-12--project-a.apps.example.com`.

## 6. Clone Project and Configure Environment

```bash
git clone <your-repo-url> mini-paas
cd mini-paas
cp .env.example .env
```

Fill `.env` with production values. Key points:

- `DOMAIN_NAME=apps.example.com`
- `BACKEND_PUBLIC_URL=https://api.apps.example.com` (or root domain path if unified)
- `WEBHOOK_SECRET` should be long/random
- `NEXTAUTH_URL=https://apps.example.com`

Install dependencies:

```bash
npm install
```

## 7. Build Workspace Packages

```bash
npm run build
```

## 8. Run Services (Systemd Recommended)

Create one service each for frontend, backend, worker.

Example backend service `/etc/systemd/system/mini-paas-backend.service`:

```ini
[Unit]
Description=Mini PaaS Backend
After=network.target redis-server.service

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/mini-paas
EnvironmentFile=/home/ubuntu/mini-paas/.env
ExecStart=/usr/bin/npm run start --workspace backend
Restart=always
RestartSec=5
User=ubuntu

[Install]
WantedBy=multi-user.target
```

Repeat similarly for:

- `npm run start --workspace frontend`
- `npm run start --workspace worker`

Enable services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mini-paas-backend mini-paas-frontend mini-paas-worker
sudo systemctl start mini-paas-backend mini-paas-frontend mini-paas-worker
```

## 9. Base NGINX Config for Frontend/Backend

Create frontend host config, for example `/etc/nginx/sites-available/platform.conf`:

```nginx
server {
    listen 80;
    server_name apps.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}

server {
    listen 80;
    server_name api.apps.example.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/platform.conf /etc/nginx/sites-enabled/platform.conf
sudo nginx -t
sudo systemctl reload nginx
```

Project-specific hosts are created dynamically by the worker through `nginx/src/manager.ts`.

## 10. Optional SSL (Let's Encrypt)

Install certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Issue certificates for primary hosts:

```bash
sudo certbot --nginx -d apps.example.com -d api.apps.example.com
```

For wildcard certs (`*.apps.example.com`), use DNS challenge with your provider plugin.

## 11. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 12. Health Checklist

- `curl http://127.0.0.1:4000/health`
- `redis-cli ping`
- `sudo nginx -t`
- `docker ps`
- login to frontend and deploy sample repo

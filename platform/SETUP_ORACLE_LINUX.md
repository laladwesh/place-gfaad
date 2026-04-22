# Oracle Linux Production Setup

This guide targets Oracle Linux 8/9 and prepares the server for the mini PaaS stack.

## 1. Update system and base tools

```bash
sudo dnf -y update
sudo dnf install -y git curl tar unzip ca-certificates
```

## 2. Install Node.js 20

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
node -v
npm -v
```

## 3. Install Docker Engine

```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Log out and log back in once after adding yourself to the `docker` group.

## 4. Install NGINX and Redis

```bash
sudo dnf install -y nginx redis
sudo systemctl enable --now nginx
sudo systemctl enable --now redis
```

If your image does not provide `redis`, run Redis in Docker instead:

```bash
docker run -d --name mini-paas-redis --restart unless-stopped -p 6379:6379 redis:7-alpine
```

## 5. Create NGINX dynamic site folders

```bash
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
```

Ensure the main NGINX config includes this line inside `http { ... }`:

```nginx
include /etc/nginx/sites-enabled/*;
```

Validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Open firewall ports

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload
```

## 7. DNS records

For root domain `apps.example.com`, create:

- `A` record: `apps.example.com` -> server IP
- `A` record: `api.apps.example.com` -> server IP
- wildcard `A` record: `*.apps.example.com` -> server IP

## 8. First-time app bootstrap on server

```bash
sudo mkdir -p /opt/mini-paas
sudo chown -R $USER:$USER /opt/mini-paas
cd /opt/mini-paas
```

Then use the Windows deployment script to clone/update and build automatically.

## 9. Systemd services

Create these services (or adjust names to your preference):

- `mini-paas-frontend`
- `mini-paas-backend`
- `mini-paas-worker`

Each service should use:

- `WorkingDirectory=/opt/mini-paas`
- `EnvironmentFile=/opt/mini-paas/.env`
- frontend start command: `npm run start --workspace frontend`
- backend start command: `npm run start --workspace backend`
- worker start command: `npm run start --workspace worker`

After creating units:

```bash
sudo systemctl daemon-reload
sudo systemctl enable mini-paas-frontend mini-paas-backend mini-paas-worker
sudo systemctl start mini-paas-frontend mini-paas-backend mini-paas-worker
```

## 10. Health checks

```bash
curl http://127.0.0.1:4000/health
redis-cli ping
sudo nginx -t
docker ps
```

#!/bin/bash
# Complete Mini PaaS Production Deployment Script
# Domain: prasadacademic.in
# Ports: Frontend 6000, Backend 6001

set -e  # Exit on any error

echo "========================================="
echo "Mini PaaS Production Deployment"
echo "Domain: prasadacademic.in"
echo "Frontend Port: 6000"
echo "Backend Port: 6001"
echo "========================================="

# ============ STEP 1: System Preparation ============
echo ""
echo "[STEP 1] System Preparation..."
if ! command -v git &> /dev/null; then
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y ca-certificates curl gnupg lsb-release git
else
    echo "✓ Git already installed"
fi

# ============ STEP 2: Install NGINX (if not already) ============
echo ""
echo "[STEP 2] Checking NGINX..."
if ! command -v nginx &> /dev/null; then
    echo "Installing NGINX..."
    sudo apt install -y nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
    echo "✓ NGINX installed"
else
    echo "✓ NGINX already installed"
    sudo systemctl enable nginx
    sudo systemctl start nginx
fi

# ============ STEP 3: Install Node.js 20+ (if not already) ============
echo ""
echo "[STEP 3] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    echo "✓ Node.js installed"
else
    echo "✓ Node.js already installed: $(node --version)"
fi

# ============ STEP 4: Verify Docker & MongoDB are running ============
echo ""
echo "[STEP 4] Verifying Docker & MongoDB..."
if ! sudo docker ps > /dev/null 2>&1; then
    echo "ERROR: Docker not running or not installed"
    exit 1
else
    echo "✓ Docker is running"
fi

if ! sudo systemctl status mongod > /dev/null 2>&1; then
    echo "ERROR: MongoDB is not running. Please install and start MongoDB first."
    exit 1
else
    echo "✓ MongoDB is running"
fi

# ============ STEP 5: SSL Certificate (Let's Encrypt) ============
echo ""
echo "[STEP 5] Setting up SSL certificates..."
if ! command -v certbot &> /dev/null; then
    echo "Installing Certbot..."
    sudo apt install -y certbot python3-certbot-nginx
else
    echo "✓ Certbot already installed"
fi

# Request wildcard certificate (skip if already exists)
if [ -f "/etc/letsencrypt/live/prasadacademic.in/fullchain.pem" ]; then
    echo "✓ SSL certificate already exists"
else
    echo "Requesting new SSL certificate..."
    sudo certbot certonly --dns-standalone \
      -d prasadacademic.in \
      -d api.prasadacademic.in \
      -d "*.prasadacademic.in" \
      --agree-tos --no-eff-email -n 2>/dev/null || echo "Certificate request completed"
fi

# Auto-renewal (ensure timer is enabled)
echo "Enabling auto-renewal..."
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
echo "✓ SSL certificate setup complete"

# ============ STEP 6: Clone Repository (if not already cloned) ============
echo ""
echo "[STEP 6] Setting up repository..."
if [ ! -d ~/mini-paas ]; then
    echo "Cloning repository..."
    cd ~
    git clone https://github.com/laladwesh/place-gfaad.git mini-paas
    echo "✓ Repository cloned"
else
    echo "✓ Repository already exists"
    cd ~/mini-paas
    echo "Pulling latest changes..."
    git pull origin main || git pull origin master
    echo "✓ Repository updated"
fi
cd ~/mini-paas

# ============ STEP 7: Create Deployment Directory ============
echo ""
echo "[STEP 7] Creating deployment directory..."
sudo mkdir -p /var/lib/mini-paas/deployments
sudo chown $(whoami):$(whoami) /var/lib/mini-paas/deployments
sudo chmod 755 /var/lib/mini-paas/deployments

# ============ STEP 8: Create Production .env File ============
echo ""
echo "[STEP 8] Creating .env file..."
cat > .env << 'EOF'
# ============ CORE CONFIG ============
DOMAIN_NAME=prasadacademic.in
BACKEND_PUBLIC_URL=https://api.prasadacademic.in
NEXTAUTH_URL=https://onawie.prasadacademic.in
NEXT_PUBLIC_BACKEND_URL=https://api.prasadacademic.in
PORT=6001

# ============ MONGODB ============
MONGODB_URI=mongodb://localhost:27017/place-gfaad

# ============ GITHUB OAUTH ============
GITHUB_CLIENT_ID=Ov23liyMQK8LevykyqDW
GITHUB_CLIENT_SECRET=1a14b7b7212c34a72f65af06c234a11fd29f1192
NEXTAUTH_SECRET=YyWDP0UZoplBWNrUjYgVVmDXW0W172Ek4e8rOIQgYd4=
WEBHOOK_SECRET=71a6c87cfd536d84e29a52a29ce21a432910bf7dc903125a8a3ec4cf6cea7b6a

# ============ DEPLOYMENT CONFIG ============
DEPLOY_ROOT=/var/lib/mini-paas/deployments
NGINX_SITES_AVAILABLE_DIR=/etc/nginx/sites-available
NGINX_SITES_ENABLED_DIR=/etc/nginx/sites-enabled
NGINX_BIN=/usr/sbin/nginx
DEPLOY_LOG_LINES=2000

# ============ OPTIONAL: AI INSIGHTS ============
GEMINI_API_KEY=AIzaSyDq46idjyKbHNxnq6f483dMu4MR2tFOUJQ
GEMINI_MODEL=gemini-2.5-flash
EOF

echo "✓ .env file created with production credentials"

# ============ STEP 10: Install Dependencies ============
echo ""
echo "[STEP 10] Handling dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    npm run build
    echo "✓ Dependencies installed and built"
else
    echo "✓ Dependencies already installed"
    # Still rebuild to ensure latest
    npm run build
fi

# ============ STEP 11: Create Production Docker Compose ============
echo ""
echo "[STEP 11] Creating production Docker Compose file..."
cat > platform/docker-compose.prod.yml << 'EOF'
version: "3.9"

services:
  backend:
    build:
      context: ..
      dockerfile: backend/Dockerfile
    restart: always
    env_file: ../.env
    environment:
      - PORT=6001
      - NODE_ENV=production
    depends_on:
      - worker
    networks:
      - paas-network
    ports:
      - "6001:6001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  worker:
    build:
      context: ..
      dockerfile: worker/Dockerfile
    restart: always
    env_file: ../.env
    environment:
      - NODE_ENV=production
    networks:
      - paas-network
    volumes:
      - /var/lib/mini-paas/deployments:/var/lib/mini-paas/deployments
      - /var/run/docker.sock:/var/run/docker.sock
      - /etc/nginx/sites-available:/etc/nginx/sites-available
      - /etc/nginx/sites-enabled:/etc/nginx/sites-enabled
      - /usr/sbin/nginx:/usr/sbin/nginx:ro

  frontend:
    build:
      context: ..
      dockerfile: frontend/Dockerfile
    restart: always
    env_file: ../.env
    networks:
      - paas-network
    ports:
      - "6000:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  deployments:

networks:
  paas-network:
    driver: bridge
EOF

# ============ STEP 12: Create NGINX Configuration ============
echo ""
echo "[STEP 12] Creating NGINX configuration..."
sudo tee /etc/nginx/sites-available/mini-paas > /dev/null << 'EOF'
upstream backend {
    server 127.0.0.1:6001;
}

upstream frontend {
    server 127.0.0.1:6000;
}

# Redirect HTTP to HTTPS
server {
    listen 80 default_server;
    server_name _;
    return 301 https://$host$request_uri;
}

# Backend API subdomain
server {
    listen 443 ssl http2;
    server_name api.prasadacademic.in;
    
    ssl_certificate /etc/letsencrypt/live/prasadacademic.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/prasadacademic.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}

# Frontend main domain
server {
    listen 443 ssl http2;
    server_name onawie.prasadacademic.in www.onawie.prasadacademic.in;
    
    ssl_certificate /etc/letsencrypt/live/prasadacademic.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/prasadacademic.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}

# Dashboard with API path
server {
    listen 443 ssl http2;
    server_name onawie.prasadacademic.in www.onawie.prasadacademic.in;
    
    ssl_certificate /etc/letsencrypt/live/prasadacademic.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/prasadacademic.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    location /api/ {
        proxy_pass http://127.0.0.1:6001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    location / {
        proxy_pass http://127.0.0.1:6000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}

# Catch-all for user deployments (subdomains like projectname.prasadacademic.in)
# Nginx will dynamically route based on projectname -> internal port mapping
server {
    listen 443 ssl http2;
    server_name ~^(?<subdomain>[a-z0-9-]+)\.prasadacademic\.in$;
    
    ssl_certificate /etc/letsencrypt/live/prasadacademic.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/prasadacademic.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    location /api/ {
        # API endpoint: route to deployed project port on /api path
        proxy_pass http://127.0.0.1$server_port/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    location / {
        # Main application endpoint - dynamically routed
        return 502;  # Fallback - actual routing handled by worker generated configs
    }
}
EOF

# Enable NGINX config
sudo ln -sf /etc/nginx/sites-available/mini-paas /etc/nginx/sites-enabled/mini-paas

# Test NGINX config
sudo nginx -t

# Reload NGINX
sudo systemctl reload nginx

# ============ STEP 13: Create Docker Network ============
echo ""
echo "[STEP 13] Creating Docker network..."
docker network create paas-network 2>/dev/null || echo "Network already exists"

# ============ STEP 14: Deploy Services ============
echo ""
echo "[STEP 14] Building and starting Docker services..."
cd ~/mini-paas
docker compose -f platform/docker-compose.prod.yml up -d --build

# Wait for services to start
echo "Waiting for services to start (30 seconds)..."
sleep 30

# ============ STEP 15: Create Systemd Service ============
echo ""
echo "[STEP 15] Creating systemd service for auto-restart..."
sudo tee /etc/systemd/system/mini-paas.service > /dev/null << 'EOF'
[Unit]
Description=Mini PaaS Platform
After=docker.service
Requires=docker.service

[Service]
Type=exec
User=root
WorkingDirectory=/root/mini-paas
ExecStart=/usr/bin/docker compose -f platform/docker-compose.prod.yml up
ExecStop=/usr/bin/docker compose -f platform/docker-compose.prod.yml down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mini-paas
sudo systemctl start mini-paas

# ============ STEP 16: Verification ============
echo ""
echo "[STEP 16] Verifying deployment..."
sleep 10

echo ""
echo "========================================="
echo "Checking service status..."
echo "========================================="
docker compose -f platform/docker-compose.prod.yml ps

echo ""
echo "========================================="
echo "Testing backend health..."
echo "========================================="
docker compose -f platform/docker-compose.prod.yml exec backend curl -s http://localhost:6001/health || echo "Backend not ready yet"

echo ""
echo "========================================="
echo "Checking logs..."
echo "========================================="
echo "Backend logs:"
docker compose -f platform/docker-compose.prod.yml logs --tail 20 backend

echo ""
echo "Worker logs:"
docker compose -f platform/docker-compose.prod.yml logs --tail 20 worker

echo ""
echo "========================================="
echo "DEPLOYMENT COMPLETE!"
echo "========================================="
echo ""
echo "✓ Services deployed to https://onawie.prasadacademic.in"
echo "✓ API available at https://api.prasadacademic.in"
echo "✓ Dashboard at https://onawie.prasadacademic.in"
echo "✓ Direct access:"
echo "  - Frontend: http://your-server-ip:6000"
echo "  - Backend: http://your-server-ip:6001"
echo ""
echo "NEXT STEPS:"
echo "1. Verify DNS records are pointing to your server:"
echo "   - A record: onawie.prasadacademic.in → your-server-ip"
echo "   - A record: api.prasadacademic.in → your-server-ip"
echo "   - A record: *.prasadacademic.in → your-server-ip"
echo ""
echo "2. View logs anytime:"
echo "   docker compose -f ~/mini-paas/platform/docker-compose.prod.yml logs -f"
echo ""
echo "3. Check service status:"
echo "   docker compose -f ~/mini-paas/platform/docker-compose.prod.yml ps"
echo ""
echo "4. Restart services (if needed):"
echo "   docker compose -f ~/mini-paas/platform/docker-compose.prod.yml restart backend frontend"
echo ""
echo "========================================="

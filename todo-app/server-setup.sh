#!/bin/bash
set -e

echo "========================================="
echo "  TODO App - Server Setup (Run Once)"
echo "========================================="

# Update system
echo "[1/6] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 via NodeSource
echo "[2/6] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "Node version: $(node -v)"
echo "npm version: $(npm -v)"

# Install PM2 globally
echo "[3/6] Installing PM2..."
sudo npm install -g pm2

# Install Nginx
echo "[4/6] Installing Nginx..."
sudo apt install -y nginx

# Configure Nginx as reverse proxy
echo "[5/6] Configuring Nginx..."
sudo tee /etc/nginx/sites-available/todo-app > /dev/null <<'NGINX'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/todo-app /etc/nginx/sites-enabled/todo-app
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# Create app directory
echo "[6/6] Creating app directory..."
sudo mkdir -p /var/www/todo-app
sudo chown ubuntu:ubuntu /var/www/todo-app

# Setup PM2 to start on boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | sudo bash

echo ""
echo "========================================="
echo "  Server setup complete!"
echo "  App directory: /var/www/todo-app"
echo "  Now run deploy.sh from your local machine"
echo "========================================="

#!/bin/bash
set -e

SERVER="todoserver"
APP_DIR="/var/www/todo-app"

echo "========================================="
echo "  Deploying TODO App to Lightsail"
echo "========================================="

# Step 1: Build locally
echo "[1/4] Building app locally..."
npm run build

# Step 2: Sync files to server
echo "[2/4] Uploading files to server..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.react-router' \
  -e ssh \
  ./ ${SERVER}:${APP_DIR}/

# Step 3: Install production dependencies on server
echo "[3/4] Installing production dependencies on server..."
ssh ${SERVER} "cd ${APP_DIR} && npm ci --omit=dev"

# Step 4: Restart with PM2
echo "[4/4] Restarting app with PM2..."
ssh ${SERVER} "cd ${APP_DIR} && pm2 startOrRestart ecosystem.config.cjs --env production && pm2 save"

echo ""
echo "========================================="
echo "  Deployment complete!"
echo "  App is live at: http://54.254.40.30"
echo "========================================="

#!/bin/bash
set -e

echo "Starting Emerald Pearl Events deployment..."

# Pull latest code
git pull origin main

# Install dependencies for both servers
echo "Installing admin portal dependencies..."
npm install --production

echo "Installing staff system dependencies..."
cd staff-system && npm install --production && cd ..

# Run database migrations or seed scripts if needed
echo "Checking database indexes..."
node scripts/ensureIndexes.js

# Restart PM2 processes
echo "Restarting services..."
pm2 reload ecosystem.config.js --env production

# Save PM2 process list
pm2 save

echo "Deployment complete."
pm2 status

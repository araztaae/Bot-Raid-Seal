#!/bin/bash
set -e

echo "📥 Pulling latest code..."
git pull origin main

echo "🐳 Rebuilding Docker..."
docker compose down
docker compose build --no-cache
docker compose up -d

echo "✅ Done! Bot is running."
docker compose logs -f --tail=20

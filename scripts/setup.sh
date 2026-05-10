#!/bin/bash
# Setup script — run once after cloning

set -e

echo "🔧 Setting up SuvPro..."

# Copy env files
cp backend/.env.example backend/.env
cp bot/.env.example bot/.env
cp web/.env.example web/.env
cp .env.example .env

echo "✅ .env files created — edit them before starting"

# Install frontend dependencies
echo "📦 Installing web dependencies..."
cd web && npm install && cd ..

echo "📦 Installing client-app dependencies..."
cd client-app && npm install && cd ..

echo "📦 Installing courier-app dependencies..."
cd courier-app && npm install && cd ..

echo "📦 Installing backend dependencies..."
cd backend && poetry install && cd ..

echo "📦 Installing bot dependencies..."
cd bot && pip install -r requirements.txt && cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env files with your credentials"
echo "  2. docker-compose up -d postgres redis"
echo "  3. cd backend && alembic upgrade head"
echo "  4. docker-compose up -d"

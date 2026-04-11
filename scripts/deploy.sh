#!/bin/bash
set -e

# ============================================
# AutoPost Deploy Script — Ubuntu VPS
# ============================================

APP_DIR="/var/www/autopost"
REPO_URL="YOUR_GIT_REPO_URL"  # Change this
BRANCH="main"

echo "🚀 AutoPost Deploy Script"
echo "========================="

# --- 1. System dependencies ---
echo "📦 Installing system dependencies..."
sudo apt update
sudo apt install -y curl git nginx

# Install Node.js 22 LTS
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    sudo npm install -g pm2
fi

echo "✅ Node $(node -v) | npm $(npm -v) | PM2 $(pm2 -v)"

# --- 2. App directory ---
if [ ! -d "$APP_DIR" ]; then
    echo "📁 Cloning repository..."
    sudo mkdir -p "$APP_DIR"
    sudo chown $USER:$USER "$APP_DIR"
    git clone "$REPO_URL" "$APP_DIR"
else
    echo "📁 Pulling latest code..."
    cd "$APP_DIR"
    git fetch origin
    git reset --hard origin/$BRANCH
fi

cd "$APP_DIR"

# --- 3. Environment ---
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found!"
    echo "   Copy .env.production.example to .env and fill in values:"
    echo "   cp .env.production.example .env"
    echo "   nano .env"
    exit 1
fi

# --- 4. Install & Build ---
echo "📦 Installing dependencies..."
npm ci --production=false

echo "🔨 Building..."
npm run build

# --- 5. Create directories ---
mkdir -p uploads logs data

# --- 6. Database migration ---
echo "🗄️ Running database migration..."
npx drizzle-kit push

# --- 7. PM2 ---
echo "🔄 Starting/Restarting with PM2..."
pm2 stop autopost 2>/dev/null || true
pm2 delete autopost 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# Auto-start on boot
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

# --- 8. Nginx ---
echo "🌐 Configuring Nginx..."
sudo cp nginx/autopost.conf /etc/nginx/sites-available/autopost
sudo ln -sf /etc/nginx/sites-available/autopost /etc/nginx/sites-enabled/autopost
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "✅ Deploy complete!"
echo ""
echo "Next steps:"
echo "  1. Update nginx/autopost.conf with your domain"
echo "  2. Setup SSL: sudo certbot --nginx -d your-domain.com"
echo "  3. Update BETTER_AUTH_URL in .env to https://your-domain.com"
echo "  4. Update Facebook App redirect URI to https://your-domain.com/api/auth/facebook/callback"
echo "  5. pm2 restart autopost"
echo ""
echo "Useful commands:"
echo "  pm2 logs autopost       — View logs"
echo "  pm2 restart autopost    — Restart app"
echo "  pm2 monit               — Monitor resources"

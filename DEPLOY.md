# AutoPost — Hướng dẫn Deploy lên VPS Ubuntu

## Yêu cầu

- VPS Ubuntu 20.04+ (1 core, 2GB RAM là đủ)
- Domain trỏ về IP của VPS (A record)
- SSH access (root hoặc sudo user)

## Bước 1: SSH vào VPS

```bash
ssh user@your-vps-ip
```

## Bước 2: Clone repo và chạy deploy script

```bash
# Clone project
git clone YOUR_REPO_URL /var/www/autopost
cd /var/www/autopost

# Hoặc upload code thủ công:
# scp -r . user@your-vps-ip:/var/www/autopost/
```

## Bước 3: Tạo file .env

```bash
cp .env.production.example .env
nano .env
```

Điền các giá trị:

| Variable | Cách lấy |
|----------|----------|
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | `https://your-domain.com` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `N8N_API_KEY` | `openssl rand -hex 24` |
| `FACEBOOK_APP_ID` | Facebook Developer Console |
| `FACEBOOK_APP_SECRET` | Facebook Developer Console |
| `AI_API_BASE_URL` | URL API AI của bạn (kèm /v1 nếu cần) |
| `AI_API_KEY` | API key từ AI provider |
| `AI_MODEL` | Tên model (vd: gpt-4o-mini, claude-sonnet-4.6) |

## Bước 4: Chạy deploy script

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

Script sẽ tự động:
- Cài Node.js 22, PM2, Nginx
- Install dependencies, build
- Chạy database migration
- Start app với PM2
- Config Nginx proxy

## Bước 5: Cấu hình domain

Sửa domain trong Nginx config:

```bash
sudo nano /etc/nginx/sites-available/autopost
# Thay "your-domain.com" bằng domain thật
sudo nginx -t && sudo systemctl reload nginx
```

## Bước 6: Setup SSL (HTTPS)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot sẽ tự động cấu hình SSL và auto-renew.

## Bước 7: Cập nhật Facebook App

Vào [Facebook Developer Console](https://developers.facebook.com/apps/):

1. **Cài đặt > Cơ bản**: Thêm domain vào "Miền ứng dụng"
2. **Đăng nhập bằng Facebook > Cài đặt**: 
   - URI chuyển hướng: `https://your-domain.com/api/auth/facebook/callback`
3. Restart app: `pm2 restart autopost`

## Bước 8: Tạo tài khoản và test

1. Mở `https://your-domain.com`
2. Đăng ký tài khoản mới
3. Kết nối Facebook Page
4. Tạo bài viết → Đăng ngay

## Các lệnh hay dùng

```bash
# Xem logs
pm2 logs autopost

# Restart app
pm2 restart autopost

# Monitor tài nguyên
pm2 monit

# Xem status
pm2 status

# Update code mới
cd /var/www/autopost
git pull
npm ci --production=false
npm run build
pm2 restart autopost
```

## Troubleshooting

### App không start
```bash
pm2 logs autopost --lines 50
# Kiểm tra .env đầy đủ chưa
```

### Nginx lỗi
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

### Database lỗi
```bash
# Re-run migration
npx drizzle-kit push
```

### Facebook OAuth lỗi
- Kiểm tra redirect URI đúng domain
- Kiểm tra FACEBOOK_APP_ID và FACEBOOK_APP_SECRET
- Kiểm tra app ở chế độ Development hay Live

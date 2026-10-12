# AutoPost

Quản lý và tự động đăng bài lên Facebook Page: hẹn giờ, queue, nhiều App/Page, import Drive/YouTube, tạo Reel (ffmpeg).

**Chế độ mặc định:** không bắt buộc đăng nhập — cài xong mở URL là dùng (một user local trong SQLite). Chỉ expose app trong mạng tin cậy.

## Yêu cầu

| Môi trường | Phiên bản |
|------------|-----------|
| Node.js | 20+ (khuyến nghị 22) |
| npm | 9+ |
| Python 3 | *(VPS/pm2)* cho `npm run setup:python` / yt-dlp |
| Docker | *(tuỳ chọn)* Docker Desktop / Compose v2 |
| Dung lượng ổ đĩa | ≥ **10 GB trống** (build Next + image Docker + `node_modules`) |

---

## Cài đặt nhanh (local)

**Windows:** chạy [`install-local.bat`](install-local.bat) trong thư mục project (tương đương các bước bên dưới; tạo `.env` từ [`.env.local.example`](.env.local.example) và sinh secret).

```bash
git clone https://github.com/TaarabtAdel/auto-post.git
cd auto-post

# 1) Dependencies + postinstall (ffmpeg +x, tải yt-dlp)
npm install

# Nếu sau install vẫn báo thiếu yt-dlp hoặc ffmpeg EACCES, chạy lại:
npm run postinstall
# hoặc:
node scripts/postinstall.js

# 2) Biến môi trường
cp .env.local.example .env          # local dev (khuyến nghị)
# hoặc: cp .env.production.example .env   # VPS / production
# Sửa .env — xem mục "Biến môi trường" bên dưới

# 3) Database
npx drizzle-kit push

# 4) Dev
npm run dev
# Mở http://localhost:3000 (PORT trong .env) hoặc http://localhost:3100 nếu bạn set PORT=3100

# Production local
npm run build
npm start
```

**Lưu ý file `.env`:** dùng **LF** (Unix), không lưu CRLF (Windows). CRLF ở dòng `PORT=3000` có thể làm `docker compose` báo `invalid containerPort`. Trong VS Code/Cursor: status bar **LF**, hoặc:

```bash
sed -i '' $'s/\r$//' .env   # macOS
```

---

## Cài đặt Docker

Compose map **cổng 3100**, volume `sqlite.db` + `uploads/` từ thư mục project.

```bash
cp .env.production.example .env
# BETTER_AUTH_URL=http://localhost:3100  (khi chạy Docker)
# Không dùng PORT=3000 trong .env cho Docker — compose đã set PORT=3100 trong container

docker compose build --no-cache
docker compose up -d
```

Mở **http://localhost:3100**

Entrypoint container tự: `chmod +x` ffmpeg (nếu cần), `drizzle-kit push`, rồi `npm start`.

```bash
docker compose logs -f app
docker compose restart    # không rebuild code — cần build lại sau khi đổi source
docker compose up -d --build
```

---

## Deploy production (VPS + pm2)

Khuyến nghị cho server Linux (VN): **Node 22**, **pm2**, **Python 3** (yt-dlp trong `.venv`), timezone **Asia/Ho_Chi_Minh** (đã set trong `ecosystem.config.js`).

### 1. Chuẩn bị máy

```bash
# Ubuntu/Debian (ví dụ)
sudo apt-get update
sudo apt-get install -y git curl python3 python3-venv build-essential

# Node 22 — dùng nvm hoặc NodeSource, ví dụ nvm:
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# nvm install 22 && nvm use 22

sudo npm install -g pm2
```

Tạo thư mục app (ví dụ `/var/www/auto-post`), clone/pull code, tạo user chạy app nếu cần.

### 2. Biến môi trường

Tạo file `.env` ở thư mục gốc project (LF, không CRLF):

```bash
cp .env.production.example .env   # nếu có; không thì tạo tay theo bảng bên dưới
```

**Production bắt buộc chỉnh:**

| Biến | Ví dụ |
|------|--------|
| `BETTER_AUTH_URL` | `https://post.example.com` (URL public, HTTPS) |
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` (64 ký tự hex) |

Facebook OAuth redirect: `{BETTER_AUTH_URL}/api/auth/facebook/callback` — khai báo đúng trên [Facebook App](https://developers.facebook.com/apps/).

### 3. Cài dependency & yt-dlp (Python)

```bash
cd /path/to/auto-post

# Tránh postinstall tải GitHub trên VPS yếu mạng — dùng Python venv (khuyến nghị):
export YOUTUBE_DL_SKIP_DOWNLOAD=1
npm ci

# yt-dlp qua pip vào .venv (app ưu tiên .venv/bin/yt-dlp)
npm run setup:python

# ffmpeg + quyền thực thi (nếu cần)
npm run postinstall
```

Thứ tự ưu tiên binary yt-dlp khi app chạy: `YT_DLP_PATH` (trong `ecosystem.config.js`) → `.venv/bin/yt-dlp` → binary npm (`youtube-dl-exec`).

Tuỳ chọn cookie YouTube (video bị chặn): thêm vào `ecosystem.config.js` → `env`:

```js
YT_DLP_COOKIES_FILE: "/path/to/cookies.txt",  // không commit file này
```

### 4. Database & build

```bash
npx drizzle-kit push    # lần đầu / sau đổi schema Drizzle
npm run build
```

**Lưu ý:** Khi `npm start` / pm2 khởi động, `instrumentation` còn tự chạy migration SQLite (AUTO campaign, system log, `post.first_comment`, …). Không cần script riêng nếu app start được.

### 5. Chạy pm2

File [`ecosystem.config.js`](ecosystem.config.js) — port **3100**, `TZ=Asia/Ho_Chi_Minh`, `YT_DLP_PATH` → `.venv/bin/yt-dlp`.

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # làm theo hướng dẫn in ra để tự chạy sau reboot
```

Cập nhật code sau này:

```bash
git pull
npm ci
npm run setup:python    # khi đổi requirements.txt hoặc lần đầu trên máy mới
npm run build
pm2 restart ecosystem.config.js
```

### 6. Reverse proxy (nginx)

Ví dụ listen 443 → `http://127.0.0.1:3100`. Body upload lớn (video/reel): tăng `client_max_body_size` (vd. `1024m`). WebSocket không bắt buộc.

### 7. Dữ liệu cần backup

| Path | Nội dung |
|------|----------|
| `sqlite.db` (+ `-wal`, `-shm`) | Toàn bộ app DB |
| `uploads/` | Video, reel, ảnh nền (`backgrounds/`, `videos/`, …) |
| `.env` | Secret (backup an toàn, không public) |

### 8. Kiểm tra sau deploy

- Mở `{BETTER_AUTH_URL}` — đăng nhập / dashboard.
- **`/apps`**, **`/pages`** — OAuth Page.
- **`/auto/plans`** — plan AUTO; **`/logs`** — log cron / pipeline (Test/Live).
- **`pm2 logs autopost`** — log terminal; AUTO in dạng `[auto] AUTO [TEST|LIVE] | Tạo bài viết | …`.
- Thử tải YouTube: **`/youtube`** hoặc AUTO bước **Video & render** + **Tự tải**.

### 9. Uploads trên disk

Layout bucket (tự tạo lúc start): `uploads/backgrounds/{userId}/`, `uploads/videos/{userId}/`, `uploads/reels/{userId}/`, …  
Media serve qua **`/api/uploads/...`** (cần session), không expose thư mục raw ra internet.

---

## Sau khi cài — luồng dùng cơ bản

1. **`/apps`** — Tạo Facebook App (App ID + Secret). Tuỳ chọn: **User Token** (Explorer) cho giới hạn quốc gia Page.
2. **`/pages`** — Kết nối Page (OAuth hoặc dán Page token). Gia hạn token / kiểm tra scopes / quốc gia.
3. **`/posts/new`** — Tạo bài, hẹn giờ hoặc queue.
4. Cron nội bộ (instrumentation) xử lý hàng đợi publish + plan AUTO (`/auto/plans`).
5. **`/auto/plans`** — lập plan → hẹn giờ hoặc **Run now**; Test/Live; log tại **`/logs`**.

Redirect OAuth Facebook: `{BETTER_AUTH_URL}/api/auth/facebook/callback`

---

## Biến môi trường

| Variable | Mô tả | Cách lấy |
|----------|--------|----------|
| `BETTER_AUTH_SECRET` | Secret session (Better Auth) | `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | URL gốc app (OAuth, link) | Local: `http://localhost:3100` hoặc port bạn chạy |
| `PORT` | Cổng `npm start` / dev | Docker: để compose set 3100; local tùy ý |
| `ENCRYPTION_KEY` | Mã hóa token Page/App trong DB (**64 hex**) | `openssl rand -hex 32` — **đổi key = token cũ không giải mã được** |
| Facebook App ID / Secret | Trong UI **`/apps`** | [Developer Console](https://developers.facebook.com/apps/) |
| `AI_API_*` | *(Tuỳ chọn)* Generate nội dung | OpenAI-compatible |
| `N8N_API_KEY` | *(Tuỳ chọn)* API publish từ n8n | `openssl rand -hex 24` |
| `FFMPEG_PATH` | *(Tuỳ chọn)* Đường dẫn ffmpeg hệ thống | Nếu không dùng `ffmpeg-static` |
| `YT_DLP_PATH` | *(Tuỳ chọn)* Binary yt-dlp | pm2: set trong `ecosystem.config.js`; mặc định `.venv/bin/yt-dlp` |
| `YT_DLP_COOKIES_FILE` | *(Tuỳ chọn)* File cookies Netscape | Video YouTube private/age-gate |
| `YOUTUBE_DL_SKIP_DOWNLOAD=1` | Bỏ qua tải yt-dlp lúc `npm ci` | Dùng với `npm run setup:python` trên VPS |

App Secret / token Page lưu **mã hóa** bằng `ENCRYPTION_KEY`. Backup `.env` cùng `sqlite.db` khi đổi máy.

---

## Scripts

```bash
npm run dev          # Dev (webpack)
npm run build        # Production build
npm start            # Chạy bản build
npm run lint         # ESLint
npm run postinstall  # chmod ffmpeg + tải yt-dlp (youtube-dl-exec)
npm run setup:python # .venv + pip install yt-dlp (khuyến nghị VPS/pm2)
```

---

## Xử lý lỗi thường gặp

### `npm ci` / Docker build: cảnh báo deprecated / unmaintained

Thường là **cảnh báo** từ dependency (eslint, v.v.), **không chặn** cài đặt. Bỏ qua nếu `npm run build` và `npm start` vẫn OK.

### Docker build fail ở `postinstall` / yt-dlp

Image dùng **`yt-dlp` từ apt** + `YOUTUBE_DL_SKIP_DOWNLOAD=1` khi `npm ci` (không tải GitHub lúc build). Build lại:

```bash
docker compose build --no-cache
```

### `Thiếu yt-dlp` / YouTube import không chạy

Trên VPS ưu tiên **Python venv** (xem mục **Deploy production**):

```bash
npm run setup:python
.venv/bin/yt-dlp --version
pm2 restart ecosystem.config.js
```

Hoặc binary npm (cần mạng GitHub lúc postinstall):

```bash
npm run postinstall
# hoặc
node node_modules/youtube-dl-exec/scripts/postinstall.js
```

Trong Docker: image thường dùng `yt-dlp` apt + `YOUTUBE_DL_SKIP_DOWNLOAD=1` — rebuild image nếu thiếu.

### AUTO / SQLite: `no such column` sau khi pull code

Restart app để `instrumentation` chạy migration (`auto_campaign`, `system_log`, …). Nếu vẫn lỗi: backup `sqlite.db`, chạy `npx drizzle-kit push`, restart pm2.

### Ảnh / media: `/api/uploads/...` trả **403 Forbidden**

Media được serve qua API (cần session), path lưu DB dạng `backgrounds/{userId}/…` hoặc legacy `{userId}/…`.

1. **Cài trên máy mới:** copy **cả** `sqlite.db` **và** thư mục `uploads/`. DB mới tạo user id khác → file cũ trong `uploads/` vẫn gắn user cũ → 403. Cách xử lý: mang theo DB cũ, hoặc upload lại ảnh.
2. **Windows:** bản cũ dùng `path.normalize()` làm lệch path → 403 ngay sau upload; cập nhật code mới (chuẩn hoá `/` trong `normalizeUploadRelativePath`).
3. **`BETTER_AUTH_URL`** phải trùng URL trên trình duyệt (vd. `http://localhost:3000`) để cookie/session đúng.
4. Thư mục `uploads/backgrounds/{userId}/` phải tồn tại và có quyền đọc; app tự `mkdir` khi upload.

### `spawn .../ffmpeg-static/ffmpeg EACCES`

Binary ffmpeg tải về **không có quyền thực thi** (hay gặp trên macOS sau copy/`npm install`):

```bash
chmod +x node_modules/ffmpeg-static/ffmpeg
npm run postinstall
```

App cũng thử `chmod` khi chạy; Docker entrypoint chmod lúc start.

Tuỳ chọn: cài ffmpeg system (`brew install ffmpeg`) và set `FFMPEG_PATH=/opt/homebrew/bin/ffmpeg`.

### `Module not found: ffmpeg-static` / `youtube-dl-exec`

Chưa install dependencies:

```bash
rm -rf node_modules .next
npm install
```

### `next build` / Docker build: `ENOSPC` / SQLite I/O

**Ổ đĩa đầy.** Giải phóng vài GB, xóa `.next/cache`, `docker system prune` (cẩn thận), rồi build lại.

### Docker: `blob sha256... input/output error` / `meta.db: input/output error`

Thường do **ổ đĩa đầy** làm hỏng Docker Desktop storage:

1. Giải phóng dung lượng (≥ 10 GB).
2. Quit Docker Desktop → **Reset / Purge data** (hoặc xóa `~/Library/Containers/com.docker.docker/Data` khi Docker đã quit).
3. `docker compose build --no-cache && docker compose up -d`

### `invalid containerPort: 3000` (docker compose)

`.env` có `PORT=3000` với ký tự **`\r`** (CRLF). Sửa line ending LF hoặc dùng compose map `3100:3100` (đã cấu hình sẵn).

### Token Page / decrypt lỗi / `ENCRYPTION_KEY`

Key trong `.env` khác lúc lưu Page → **OAuth lại** hoặc **Cập nhật token** trên `/pages`. Đồng bộ cùng `ENCRYPTION_KEY` giữa máy dev và Docker.

### Bình luận đầu / `#200` permissions

Scope nằm trên **Page token trong DB**, không phải tick Explorer. **OAuth lại** hoặc **Cập nhật token**; kiểm tra cột **Scopes token** trên `/pages`.

### Media preview / URL upload

File phục vụ qua **`/api/uploads/{bucket}/{userId}/...`** hoặc legacy `{userId}/...` (cần session). Đường dẫn disk: `uploads/backgrounds/`, `uploads/videos/`, … — không public trực tiếp ra internet.

### `docker compose restart` không thấy code mới

`restart` không rebuild image. Dùng:

```bash
docker compose up -d --build
```

---

## Tech stack (tóm tắt)

| Layer | Công nghệ |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| DB | SQLite WAL + Drizzle |
| Auth | Better Auth (tắt email/password; bypass user local) |
| Facebook | Graph API v21, OAuth |
| Video | ffmpeg-static, yt-dlp (`.venv` pip hoặc youtube-dl-exec) |

## Cấu trúc (rút gọn)

```
src/app/(dashboard)/   # UI: dashboard, apps, pages, posts, reels, youtube
src/app/api/           # REST API
src/lib/               # auth, facebook, publish, reel, youtube, ...
scripts/postinstall.js      # ffmpeg chmod + yt-dlp npm
scripts/setup-python-ytdlp.sh  # .venv + pip yt-dlp
ecosystem.config.js         # pm2: port 3100, TZ VN, YT_DLP_PATH
uploads/               # Media (gitignore)
sqlite.db              # Database (gitignore)
```

## License

Private.

# AutoPost

Quản lý và tự động đăng bài lên Facebook Page: hẹn giờ, queue, nhiều App/Page, import Drive/YouTube, tạo Reel (ffmpeg).

**Chế độ mặc định:** không bắt buộc đăng nhập — cài xong mở URL là dùng (một user local trong SQLite). Chỉ expose app trong mạng tin cậy.

## Yêu cầu

| Môi trường | Phiên bản |
|------------|-----------|
| Node.js | 20+ (khuyến nghị 22) |
| npm | 9+ |
| Docker | *(tuỳ chọn)* Docker Desktop / Compose v2 |
| Dung lượng ổ đĩa | ≥ **10 GB trống** (build Next + image Docker + `node_modules`) |

---

## Cài đặt nhanh (local)

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
cp .env.production.example .env
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

## Sau khi cài — luồng dùng cơ bản

1. **`/apps`** — Tạo Facebook App (App ID + Secret). Tuỳ chọn: **User Token** (Explorer) cho giới hạn quốc gia Page.
2. **`/pages`** — Kết nối Page (OAuth hoặc dán Page token). Gia hạn token / kiểm tra scopes / quốc gia.
3. **`/posts/new`** — Tạo bài, hẹn giờ hoặc queue.
4. Cron nội bộ (instrumentation) xử lý hàng đợi publish.

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

App Secret / token Page lưu **mã hóa** bằng `ENCRYPTION_KEY`. Backup `.env` cùng `sqlite.db` khi đổi máy.

---

## Scripts

```bash
npm run dev          # Dev (webpack)
npm run build        # Production build
npm start            # Chạy bản build
npm run lint         # ESLint
npm run postinstall  # chmod ffmpeg + tải yt-dlp (youtube-dl-exec)
```

---

## Xử lý lỗi thường gặp

### `Thiếu yt-dlp` / YouTube import không chạy

`youtube-dl-exec` cần binary `yt-dlp` sau install:

```bash
npm run postinstall
# hoặc
node node_modules/youtube-dl-exec/scripts/postinstall.js
```

Cần mạng ổn định lần đầu tải. Trong Docker: rebuild image (`npm ci` chạy `postinstall`).

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

File phục vụ qua **`/api/uploads/{userId}/{file}`** (cần session local). Đường dẫn disk: `uploads/...` — không mở trực tiếp `/uploads/...` trừ khi dùng rewrite (app hỗ trợ `/uploads` → `/api/uploads`).

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
| Video | ffmpeg-static, youtube-dl-exec (yt-dlp) |

## Cấu trúc (rút gọn)

```
src/app/(dashboard)/   # UI: dashboard, apps, pages, posts, reels, youtube
src/app/api/           # REST API
src/lib/               # auth, facebook, publish, reel, youtube, ...
scripts/postinstall.js # ffmpeg chmod + yt-dlp
uploads/               # Media (gitignore)
sqlite.db              # Database (gitignore)
```

## License

Private.

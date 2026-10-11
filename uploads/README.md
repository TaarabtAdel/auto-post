# uploads/

File media theo **bucket** (dọn VPS: xóa `videos/`, giữ `backgrounds/`):

```text
uploads/backgrounds/{userId}/   — ảnh nền
uploads/videos/{userId}/        — video nguồn
uploads/reels/{userId}/         — reel đã render
uploads/audio/{userId}/         — nhạc
uploads/images/{userId}/        — ảnh bài post
uploads/tmp-reel/               — ffmpeg tạm
```

Các thư mục bucket gốc có `.gitkeep` — đẩy lên git. File user nằm trong `{userId}/` con, git ignore.

FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates curl \
    yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
# Tránh tải yt-dlp từ GitHub lúc build (hay timeout); dùng gói apt + symlink.
ENV YOUTUBE_DL_SKIP_DOWNLOAD=1
RUN npm ci \
  && mkdir -p node_modules/youtube-dl-exec/bin \
  && ln -sf /usr/bin/yt-dlp node_modules/youtube-dl-exec/bin/yt-dlp

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/db ./src/db
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p uploads \
  && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3100

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]

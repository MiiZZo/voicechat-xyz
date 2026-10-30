FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

# Веб-клиент: статическая сборка общего renderer'а (apps/client).
# Build context — корень репозитория (см. docker-compose.yml).
FROM node:20-alpine AS web
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/client/package.json ./apps/client/
RUN npm ci --workspace @voicechat/client --include-workspace-root
COPY apps/client ./apps/client
# Лобби живёт на том же домене, что и веб-клиент. Переменная окружения
# перебивает VITE_LOBBY_URL из apps/client/.env.production.
ARG LOBBY_DOMAIN
RUN test -n "$LOBBY_DOMAIN" \
 && VITE_LOBBY_URL="https://$LOBBY_DOMAIN" npm run build -w @voicechat/client

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY --from=web /app/apps/client/dist /srv/web

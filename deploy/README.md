# VoiceChat — деплой

## Требования
- VPS с публичным IP (рекомендуется не-РФ — в РФ-сетях возможна SNI/DPI фильтрация
  входящих TLS-соединений к малоизвестным доменам). Ubuntu 22.04+ или аналогичный.
- Открытые порты: 80/TCP, 443/TCP, 7881/TCP, 7882/UDP
- Установлены Docker и Docker Compose plugin (`wget -qO- https://get.docker.com | sh`)
- Доменное имя с DNS-зоной в Cloudflare (free plan ок) и двумя A-записями
  на IP сервера, **облачко серое (DNS only)** для обоих:
  - `chat.example.com` → лобби + веб-клиент
  - `livekit.example.com` → SFU
- Cloudflare API token с правом `Zone:DNS:Edit` для зоны домена
  (https://dash.cloudflare.com/profile/api-tokens, шаблон **Edit zone DNS**).
  Используется Caddy для ACME DNS-01 challenge — избегает HTTP-01/TLS-ALPN-01,
  которые ломаются при DPI на пути или нестабильной маршрутизации.

## Установка
```bash
git clone <repo> voicechat
cd voicechat/deploy
cp .env.example .env
# отредактировать .env:
#   LOBBY_DOMAIN, LIVEKIT_DOMAIN — твои поддомены
#   LIVEKIT_API_SECRET — openssl rand -hex 32
#   CLOUDFLARE_API_TOKEN — токен из шага выше
docker compose up -d --build
```

Образ Caddy заодно собирает веб-клиент (`apps/client`) и раздаёт его с
`LOBBY_DOMAIN`: `/api/*` и `/healthz` проксируются в lobby, остальное — SPA.
После изменений в клиенте достаточно `docker compose up -d --build caddy`.

Первая сборка собирает Caddy с плагином `caddy-dns/cloudflare` через xcaddy
(~3-7 минут на 1 vCPU; для VPS с <2 ГБ RAM желательно 2 ГБ swap, иначе
сборщик может OOM-killнуться). После старта Caddy получает сертификаты
через DNS-01 за ~30 секунд.

## Проверка
```
curl https://chat.example.com/healthz
# → {"status":"ok"}
curl https://chat.example.com/api/rooms
# → [{"id":"general", ...}]
curl -I https://chat.example.com/
# → 200, веб-клиент
```

## Изменение списка комнат
Отредактируйте `apps/server/rooms.yaml` в репозитории и перезапустите сервис:
```
docker compose restart lobby
```

## Логи
```
docker compose logs -f lobby
docker compose logs -f livekit
docker compose logs -f caddy
```

## Обновление сертификатов
Caddy сам обновляет сертификаты за 30 дней до истечения через тот же
DNS-01. Никаких действий не требуется. Том `caddy_data` хранит ACME-аккаунт
и сертификаты между перезапусками — не удаляйте его без необходимости.

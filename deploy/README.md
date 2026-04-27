# VoiceChat — деплой

## Требования
- VPS с публичным IP, Ubuntu 22.04+ или аналогичный
- Открытые порты: 80/TCP, 443/TCP, 7881/TCP, 7882/UDP
- Установлены Docker и Docker Compose plugin
- Доменное имя с двумя A-записями: `chat.example.com` и `livekit.example.com` → IP сервера

## Установка
```bash
git clone <repo> voicechat
cd voicechat/deploy
cp .env.example .env
# отредактировать .env: домены, сгенерировать LIVEKIT_API_SECRET (32+ символов)
docker compose up -d --build
```

Caddy автоматически получит TLS-сертификаты Let's Encrypt в течение минуты после первого запроса.

## Проверка
```
curl https://chat.example.com/healthz
# → {"status":"ok"}
curl https://chat.example.com/api/rooms
# → [{"id":"general", ...}]
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

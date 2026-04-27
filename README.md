# VoiceChat

Windows desktop voice/text chat with screen sharing for small rooms (up to 8 participants). Self-hosted: Electron client + Fastify lobby server + LiveKit SFU.

See the [design spec](docs/superpowers/specs/2026-04-26-voicechat-design.md) and [implementation plan](docs/superpowers/plans/2026-04-26-voicechat-implementation.md) for architecture details.

## Stack
- **Client:** Electron 31 + React 18 + Vite + Tailwind + shadcn/ui + LiveKit SDK
- **Lobby server:** Node 20 + Fastify + LiveKit Server SDK + zod + chokidar
- **Media SFU:** LiveKit (self-hosted in Docker)
- **Deploy:** docker-compose + Caddy (auto-HTTPS via Let's Encrypt) on a single VPS

## Local development

Three things run together: LiveKit dev container, lobby server, Electron client.

**1. Start LiveKit dev container** (in a separate terminal):
```
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  -e LIVEKIT_KEYS="devkey: secret-at-least-32-characters-long-here" \
  livekit/livekit-server --dev --bind 0.0.0.0
```

**2. Start lobby server** (another terminal):
```
cd apps/server
cp .env.example .env  # only first time
npm run dev -w @voicechat/server
```

**3. Start Electron client**:
```
npm run dev -w @voicechat/client
```

The client connects to the lobby on `http://localhost:3000` and to LiveKit on `ws://localhost:7880`.

## Two-client smoke test

To verify end-to-end media + chat:
1. Run two `npm run dev:client` instances simultaneously
2. Set distinct nicks in each window
3. Join the same room (e.g. "Общая")
4. Verify: both tiles appear, two-way audio works
5. Toggle camera in one — other sees video
6. Click "Demo" in one, pick a screen — other sees a big screen-share tile
7. Send chat messages — both windows see them in real time
8. Try joining the same room from a third window with one of the existing nicks → server returns 409 (`duplicate_name`)
9. Open settings, toggle noise suppression off, leave and rejoin — value persists across restart

## Building a Windows installer

```
npm run package -w @voicechat/client
```

Produces an NSIS installer at `apps/client/release/<version>/VoiceChat-<version>-Setup.exe`. Auto-update reads from GitHub Releases (configured in `apps/client/electron-builder.yml`).

## Deployment

See [`deploy/README.md`](deploy/README.md).

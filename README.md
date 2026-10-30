# VoiceChat

Voice/text chat with screen sharing for small rooms (up to 8 participants). Self-hosted: Tauri desktop client + web client + Fastify lobby server + LiveKit SFU.

See the [design spec](docs/superpowers/specs/2026-04-26-voicechat-design.md) and [implementation plan](docs/superpowers/plans/2026-04-26-voicechat-implementation.md) for architecture details.

## Stack
- **Clients:** one React 18 + Vite + Tailwind + shadcn/ui + LiveKit SDK renderer (`apps/client/src/renderer`), shipped two ways:
  - **Web** — `apps/client`, a static SPA served by Caddy from the lobby domain
  - **Desktop** — `apps/client-tauri`, Tauri 2 (WebView2) with tray, global hotkeys and auto-update
- Platform-specific bits go through the `window.api` contract (`apps/client/src/shared/api.ts`); desktop-only capabilities are optional and the UI hides what's missing.
- **Lobby server:** Node 20 + Fastify + LiveKit Server SDK + zod + chokidar
- **Media SFU:** LiveKit (self-hosted in Docker)
- **Deploy:** docker-compose + Caddy (auto-HTTPS via Let's Encrypt) on a single VPS

## Local development

Three things run together: LiveKit dev container, lobby server, a client.

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

**3. Start a client** — web (opens on http://localhost:5173) or Tauri:
```
npm run dev:client          # web
npm run dev:client-tauri    # desktop
```

The client connects to the lobby on `http://localhost:3000` and to LiveKit on `ws://localhost:7880`.

## Two-client smoke test

To verify end-to-end media + chat:
1. Open the web client in two browser windows (or web + Tauri)
2. Set distinct nicks in each window
3. Join the same room (e.g. "Общая")
4. Verify: both tiles appear, two-way audio works
5. Toggle camera in one — other sees video
6. Click "Demo" in one, pick a screen — other sees a big screen-share tile
7. Send chat messages — both windows see them in real time
8. Try joining the same room from a third window with one of the existing nicks → server returns 409 (`duplicate_name`)
9. Open settings, toggle noise suppression off, leave and rejoin — value persists across restart

## Releasing

- **Desktop:** bump the version in `apps/client-tauri` (`package.json`, `src-tauri/Cargo.toml`, `Cargo.lock`, `tauri.conf.json`) and push a `tauri-v<version>` tag — `.github/workflows/release-tauri.yml` builds and publishes the release, clients pick it up via auto-update.
- **Web:** rebuilt on deploy (`docker compose up -d --build` in `deploy/`), see below.

## Deployment

See [`deploy/README.md`](deploy/README.md).

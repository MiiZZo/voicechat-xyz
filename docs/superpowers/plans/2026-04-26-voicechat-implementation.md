# VoiceChat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop voice/text chat app with screen share, fixed room list, guest auth, deployable on a single Hetzner VPS.

**Architecture:** Three components — Electron client (React + LiveKit SDK), Fastify lobby server (rooms.yaml + JWT issuance), self-hosted LiveKit SFU. Lobby orchestration only; media flows through LiveKit.

**Tech Stack:** Node.js 20+, TypeScript strict, Electron 30+, React 18, Vite, Tailwind, shadcn/ui, zustand, livekit-client, @livekit/components-react, Fastify, livekit-server-sdk, zod, js-yaml, chokidar, pino, Docker, Caddy.

**Spec:** `docs/superpowers/specs/2026-04-26-voicechat-design.md`

**Note on testing:** Per spec section 2, this project does NOT use automated tests. Verification is manual. Each task includes manual verification steps.

---

## Chunk 1: Monorepo scaffolding

### Task 1.1: Initialize npm workspace root

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.nvmrc`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "voicechat",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["apps/*"],
  "scripts": {
    "lint": "npm run lint -ws --if-present",
    "build": "npm run build -ws --if-present",
    "dev:server": "npm run dev -w @voicechat/server",
    "dev:client": "npm run dev -w @voicechat/client"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
release/
out/
.vite/
```

- [ ] **Step 4: Create `.nvmrc`**

```
20
```

- [ ] **Step 5: Create `.editorconfig`**

```
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [ ] **Step 6: Create `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 7: Install root deps**

Run: `npm install`
Expected: `node_modules/` populated, no errors.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: scaffold npm workspace root with TS + Prettier"
```

### Task 1.2: Create root README and ESLint config

**Files:**
- Create: `README.md`
- Create: `eslint.config.js`

- [ ] **Step 1: Create minimal `README.md`** (one paragraph: what the project is, link to spec)

- [ ] **Step 2: Create `eslint.config.js`** (flat config for ESLint 9)

```js
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { ignores: ['**/dist/**', '**/node_modules/**', '**/release/**'] },
];
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "chore: add root README and ESLint flat config"
```

---

## Chunk 2: Lobby server — scaffolding & config

### Task 2.1: Scaffold `@voicechat/server` package

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/index.ts`

- [ ] **Step 1: Create `apps/server/package.json`**

```json
{
  "name": "@voicechat/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src"
  },
  "dependencies": {
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.0",
    "livekit-server-sdk": "^2.6.0",
    "zod": "^3.23.0",
    "js-yaml": "^4.1.0",
    "chokidar": "^3.6.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `apps/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create stub `apps/server/src/index.ts`**

```ts
import { logger } from './logger.js';

logger.info('voicechat server starting...');
```

- [ ] **Step 4: Install workspace deps**

Run from repo root: `npm install`
Expected: deps installed under `apps/server/node_modules` (or hoisted to root).

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): scaffold lobby server package"
```

### Task 2.2: Logger and config loader

**Files:**
- Create: `apps/server/src/logger.ts`
- Create: `apps/server/src/config.ts`
- Create: `apps/server/.env.example`

- [ ] **Step 1: Create `apps/server/src/logger.ts`**

```ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
```

- [ ] **Step 2: Create `apps/server/src/config.ts`**

```ts
import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  ROOMS_FILE: z.string().default('./rooms.yaml'),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment config:', parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
}
```

- [ ] **Step 3: Create `apps/server/.env.example`**

```
PORT=3000
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret-at-least-32-characters-long-here
ROOMS_FILE=./rooms.yaml
LOG_LEVEL=debug
```

- [ ] **Step 4: Manual verify**

Create `.env` (copy of `.env.example`), run `npm run dev -w @voicechat/server`. Expected: `voicechat server starting...` log line, no errors.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): add logger and env config loader"
```

### Task 2.3: Rooms registry with hot-reload

**Files:**
- Create: `apps/server/src/rooms-registry.ts`
- Create: `apps/server/rooms.yaml`

- [ ] **Step 1: Create `apps/server/rooms.yaml`**

```yaml
rooms:
  - id: general
    name: "Общая"
  - id: games
    name: "Игры"
  - id: work
    name: "Работа"
```

- [ ] **Step 2: Create `apps/server/src/rooms-registry.ts`**

```ts
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import chokidar from 'chokidar';
import { z } from 'zod';
import { logger } from './logger.js';

const RoomDefSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[a-z0-9_-]+$/, 'id must be lowercase slug'),
  name: z.string().min(1).max(48),
});

const FileSchema = z.object({ rooms: z.array(RoomDefSchema) });

export type RoomDef = z.infer<typeof RoomDefSchema>;

export class RoomsRegistry {
  private rooms = new Map<string, RoomDef>();

  constructor(private readonly file: string) {}

  async start(): Promise<void> {
    await this.reload();
    chokidar
      .watch(resolve(this.file), { ignoreInitial: true })
      .on('change', () => {
        this.reload().catch((err) =>
          logger.error({ err }, 'rooms.yaml reload failed; keeping prev state'),
        );
      });
  }

  list(): RoomDef[] {
    return Array.from(this.rooms.values());
  }

  get(id: string): RoomDef | undefined {
    return this.rooms.get(id);
  }

  private async reload(): Promise<void> {
    const raw = await readFile(this.file, 'utf8');
    const parsed = FileSchema.parse(yaml.load(raw));
    const next = new Map<string, RoomDef>();
    for (const room of parsed.rooms) {
      if (next.has(room.id)) throw new Error(`duplicate room id: ${room.id}`);
      next.set(room.id, room);
    }
    this.rooms = next;
    logger.info({ count: next.size }, 'rooms.yaml loaded');
  }
}
```

- [ ] **Step 3: Wire up in `apps/server/src/index.ts`**

```ts
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { RoomsRegistry } from './rooms-registry.js';

const config = loadConfig();
const rooms = new RoomsRegistry(config.ROOMS_FILE);
await rooms.start();
logger.info({ rooms: rooms.list().map((r) => r.id) }, 'registry ready');
```

- [ ] **Step 4: Manual verify**

Run: `npm run dev -w @voicechat/server`
Expected log: `rooms.yaml loaded count=3`, then `registry ready`.

Edit `rooms.yaml` (rename one room) — server logs reload without restart.

Break YAML (insert `:::`) — server logs error but stays running with old state.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): rooms.yaml registry with hot-reload"
```

---

## Chunk 3: Lobby server — LiveKit integration & HTTP API

### Task 3.1: LiveKit client wrapper with caching

**Files:**
- Create: `apps/server/src/livekit-client.ts`

- [ ] **Step 1: Create wrapper**

```ts
import { RoomServiceClient, type ParticipantInfo } from 'livekit-server-sdk';
import type { Config } from './config.js';

export type ParticipantSummary = { identity: string; name: string };

export class LiveKitClient {
  private readonly svc: RoomServiceClient;
  private cache = new Map<string, { at: number; data: ParticipantSummary[] }>();
  private static readonly CACHE_TTL_MS = 1000;

  constructor(config: Config) {
    // RoomServiceClient wants HTTP(S), not WSS — convert.
    const httpUrl = config.LIVEKIT_URL.replace(/^ws/, 'http');
    this.svc = new RoomServiceClient(httpUrl, config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  }

  /** Cached list — used by GET /api/rooms (1s TTL to dedupe polling). */
  async listParticipantsCached(roomId: string): Promise<ParticipantSummary[]> {
    const hit = this.cache.get(roomId);
    if (hit && Date.now() - hit.at < LiveKitClient.CACHE_TTL_MS) return hit.data;
    const fresh = await this.listParticipantsFresh(roomId);
    this.cache.set(roomId, { at: Date.now(), data: fresh });
    return fresh;
  }

  /** Bypass-cache list — used by POST /api/join for full/duplicate checks. */
  async listParticipantsFresh(roomId: string): Promise<ParticipantSummary[]> {
    try {
      const participants: ParticipantInfo[] = await this.svc.listParticipants(roomId);
      return participants.map((p) => ({
        identity: p.identity,
        name: p.name || p.identity.split('#')[0] || p.identity,
      }));
    } catch (err: unknown) {
      // LiveKit returns 404-ish for empty/nonexistent rooms; treat as empty.
      const code = (err as { status?: number; code?: number })?.status;
      if (code === 404) return [];
      throw err;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat(server): LiveKit client with cached participant listing"
```

### Task 3.2: Token issuer

**Files:**
- Create: `apps/server/src/token-issuer.ts`

- [ ] **Step 1: Create token issuer**

```ts
import { AccessToken } from 'livekit-server-sdk';
import { randomBytes } from 'node:crypto';
import type { Config } from './config.js';

export class TokenIssuer {
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  static fromConfig(config: Config): TokenIssuer {
    return new TokenIssuer(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  }

  /** identity = `{displayName}#{4hex}` so collisions during race resolve. */
  buildIdentity(displayName: string): string {
    return `${displayName}#${randomBytes(2).toString('hex')}`;
  }

  async issue(args: { roomId: string; displayName: string; identity: string }): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: args.identity,
      name: args.displayName,
      ttl: 60 * 60 * 24, // 24h
    });
    token.addGrant({
      roomJoin: true,
      room: args.roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return token.toJwt();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat(server): JWT token issuer with 24h TTL"
```

### Task 3.3: HTTP routes

**Files:**
- Create: `apps/server/src/routes.ts`
- Create: `apps/server/src/validation.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Create `apps/server/src/validation.ts`**

```ts
import { z } from 'zod';

// Forbidden: '#', control chars (\x00-\x1F\x7F), bidi-overrides (U+202A-U+202E, U+2066-U+2069).
const FORBIDDEN_RE = /[\x00-\x1F\x7F#‪-‮⁦-⁩]/;

export const DisplayNameSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(1, 'displayName required')
      .max(32, 'displayName too long')
      .refine((s) => !FORBIDDEN_RE.test(s), 'displayName contains forbidden characters'),
  );

export const JoinBodySchema = z.object({
  roomId: z.string().min(1).max(48),
  displayName: DisplayNameSchema,
});
```

- [ ] **Step 2: Create `apps/server/src/routes.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { JoinBodySchema } from './validation.js';
import type { RoomsRegistry } from './rooms-registry.js';
import type { LiveKitClient } from './livekit-client.js';
import type { TokenIssuer } from './token-issuer.js';
import type { Config } from './config.js';

const MAX_PARTICIPANTS = 8;

export type RouteDeps = {
  config: Config;
  rooms: RoomsRegistry;
  livekit: LiveKitClient;
  tokens: TokenIssuer;
};

export async function registerRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/api/rooms', async () => {
    const list = deps.rooms.list();
    const result = await Promise.all(
      list.map(async (room) => ({
        id: room.id,
        displayName: room.name,
        maxParticipants: MAX_PARTICIPANTS,
        participants: await deps.livekit.listParticipantsCached(room.id),
      })),
    );
    return result;
  });

  app.post('/api/join', async (req, reply) => {
    const parsed = JoinBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid input' });
    }
    const { roomId, displayName } = parsed.data;

    if (!deps.rooms.get(roomId)) return reply.code(404).send({ error: 'room not found' });

    const current = await deps.livekit.listParticipantsFresh(roomId);
    if (current.length >= MAX_PARTICIPANTS) {
      return reply.code(409).send({ reason: 'full' });
    }
    const nameTaken = current.some((p) => p.name === displayName);
    if (nameTaken) {
      return reply.code(409).send({ reason: 'duplicate_name' });
    }

    const identity = deps.tokens.buildIdentity(displayName);
    const token = await deps.tokens.issue({ roomId, displayName, identity });
    return { token, livekitUrl: deps.config.LIVEKIT_URL, identity };
  });
}
```

- [ ] **Step 3: Wire up in `apps/server/src/index.ts`**

Replace the contents:

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { RoomsRegistry } from './rooms-registry.js';
import { LiveKitClient } from './livekit-client.js';
import { TokenIssuer } from './token-issuer.js';
import { registerRoutes } from './routes.js';

const config = loadConfig();
const rooms = new RoomsRegistry(config.ROOMS_FILE);
await rooms.start();

const livekit = new LiveKitClient(config);
const tokens = TokenIssuer.fromConfig(config);

const app = Fastify({ loggerInstance: logger });
await app.register(cors, { origin: true });
await registerRoutes(app, { config, rooms, livekit, tokens });

await app.listen({ port: config.PORT, host: '0.0.0.0' });
logger.info({ port: config.PORT }, 'lobby server listening');
```

- [ ] **Step 4: Manual verify**

Start LiveKit dev container in another terminal:
```
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  -e LIVEKIT_KEYS="devkey: secret-at-least-32-characters-long-here" \
  livekit/livekit-server --dev --bind 0.0.0.0
```

Start server: `npm run dev -w @voicechat/server`

Curl:
```
curl http://localhost:3000/healthz
# → {"status":"ok"}

curl http://localhost:3000/api/rooms
# → [{"id":"general","displayName":"Общая","maxParticipants":8,"participants":[]}, ...]

curl -X POST http://localhost:3000/api/join \
  -H "content-type: application/json" \
  -d '{"roomId":"general","displayName":"Тест"}'
# → {"token":"eyJ...","livekitUrl":"ws://localhost:7880","identity":"Тест#abcd"}

curl -X POST http://localhost:3000/api/join \
  -H "content-type: application/json" \
  -d '{"roomId":"missing","displayName":"X"}'
# → 404

curl -X POST http://localhost:3000/api/join \
  -H "content-type: application/json" \
  -d '{"roomId":"general","displayName":"   "}'
# → 400 (empty after trim)

curl -X POST http://localhost:3000/api/join \
  -H "content-type: application/json" \
  -d '{"roomId":"general","displayName":"bad#name"}'
# → 400 (forbidden char)
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(server): /api/rooms and /api/join endpoints"
```

---

## Chunk 4: Electron client — main process & preload

### Task 4.1: Scaffold `@voicechat/client` package

**Files:**
- Create: `apps/client/package.json`
- Create: `apps/client/tsconfig.json`
- Create: `apps/client/tsconfig.node.json`
- Create: `apps/client/electron.vite.config.ts`
- Create: `apps/client/index.html`

- [ ] **Step 1: Create `apps/client/package.json`**

```json
{
  "name": "@voicechat/client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "electron-vite build && electron-builder",
    "lint": "eslint src"
  },
  "dependencies": {
    "electron-store": "^10.0.0",
    "electron-updater": "^6.2.0"
  },
  "devDependencies": {
    "@livekit/components-react": "^2.6.0",
    "@livekit/components-styles": "^1.1.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "electron": "^31.0.0",
    "electron-builder": "^24.13.0",
    "electron-vite": "^2.3.0",
    "livekit-client": "^2.6.0",
    "lucide-react": "^0.400.0",
    "postcss": "^8.4.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "zustand": "^4.5.0"
  }
}
```

- [ ] **Step 2: Create `apps/client/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "paths": { "@/*": ["./src/renderer/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/client/tsconfig.node.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "module": "ESNext", "moduleResolution": "Bundler" },
  "include": ["electron.vite.config.ts"]
}
```

- [ ] **Step 4: Create `apps/client/electron.vite.config.ts`**

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: { build: { outDir: 'out/main' } },
  preload: { build: { outDir: 'out/preload' } },
  renderer: {
    root: '.',
    plugins: [react()],
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer') } },
    build: { outDir: 'out/renderer', rollupOptions: { input: 'index.html' } },
  },
});
```

- [ ] **Step 5: Create `apps/client/index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VoiceChat</title>
  </head>
  <body class="dark bg-zinc-950 text-zinc-100">
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Run `npm install` from root, commit**

```bash
git add .
git commit -m "feat(client): scaffold electron-vite project"
```

### Task 4.2: Main process — window + IPC scaffold

**Files:**
- Create: `apps/client/src/main/index.ts`
- Create: `apps/client/src/main/ipc.ts`
- Create: `apps/client/src/main/prefs.ts`
- Create: `apps/client/src/shared/types.ts`

- [ ] **Step 1: Create shared types `apps/client/src/shared/types.ts`**

```ts
export type Prefs = {
  displayName: string;
  audioInputDeviceId: string | null;
  audioOutputDeviceId: string | null;
  videoInputDeviceId: string | null;
  audioConstraints: {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  };
  pushToTalk: { enabled: boolean; key: string };
  participantVolumes: Record<string, number>;
  initialDeviceState: { mic: boolean; camera: boolean };
};

export type ScreenSource = {
  id: string;
  name: string;
  thumbnailDataUrl: string;
};

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string };

export const IPC = {
  GetPrefs: 'prefs:get',
  SetPrefs: 'prefs:set',
  GetScreenSources: 'screen:get-sources',
  CheckUpdate: 'update:check',
  InstallUpdate: 'update:install',
  UpdateStatus: 'update:status',
} as const;
```

- [ ] **Step 2: Create `apps/client/src/main/prefs.ts`**

```ts
import Store from 'electron-store';
import os from 'node:os';
import type { Prefs } from '../shared/types.js';

const defaults: Prefs = {
  displayName: os.userInfo().username || '',
  audioInputDeviceId: null,
  audioOutputDeviceId: null,
  videoInputDeviceId: null,
  audioConstraints: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  pushToTalk: { enabled: false, key: 'AltRight' },
  participantVolumes: {},
  initialDeviceState: { mic: true, camera: false },
};

export const prefsStore = new Store<Prefs>({ name: 'voicechat-prefs', defaults });

export function getPrefs(): Prefs {
  return prefsStore.store;
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  prefsStore.store = { ...prefsStore.store, ...patch };
  return prefsStore.store;
}
```

- [ ] **Step 3: Create `apps/client/src/main/ipc.ts`**

```ts
import { ipcMain, desktopCapturer } from 'electron';
import { IPC } from '../shared/types.js';
import type { ScreenSource } from '../shared/types.js';
import { getPrefs, setPrefs } from './prefs.js';

export function registerIpc(): void {
  ipcMain.handle(IPC.GetPrefs, () => getPrefs());
  ipcMain.handle(IPC.SetPrefs, (_evt, patch) => setPrefs(patch));

  ipcMain.handle(IPC.GetScreenSources, async (): Promise<ScreenSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnailDataUrl: s.thumbnail.toDataURL(),
    }));
  });
}
```

- [ ] **Step 4: Create `apps/client/src/main/index.ts`**

```ts
import { app, BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { registerIpc } from './ipc.js';
import { setupAutoUpdate } from './updater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();
  setupAutoUpdate(() => mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 5: Create stub `apps/client/src/main/updater.ts`**

```ts
import type { BrowserWindow } from 'electron';

export function setupAutoUpdate(_getWindow: () => BrowserWindow | null): void {
  // Filled in Task 8.1
}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(client): main process scaffold with IPC and prefs"
```

### Task 4.3: Preload bridge

**Files:**
- Create: `apps/client/src/preload/index.ts`

- [ ] **Step 1: Create preload**

```ts
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/types.js';
import type { Prefs, ScreenSource, UpdateStatus } from '../shared/types.js';

const api = {
  getPrefs: (): Promise<Prefs> => ipcRenderer.invoke(IPC.GetPrefs),
  setPrefs: (patch: Partial<Prefs>): Promise<Prefs> => ipcRenderer.invoke(IPC.SetPrefs, patch),
  getScreenSources: (): Promise<ScreenSource[]> => ipcRenderer.invoke(IPC.GetScreenSources),
  checkUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.CheckUpdate),
  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.InstallUpdate),
  onUpdateStatus: (cb: (s: UpdateStatus) => void) => {
    const listener = (_evt: unknown, s: UpdateStatus) => cb(s);
    ipcRenderer.on(IPC.UpdateStatus, listener);
    return () => ipcRenderer.removeListener(IPC.UpdateStatus, listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
declare global {
  interface Window {
    api: Api;
  }
}
```

- [ ] **Step 2: Manual verify**

Run `npm run dev -w @voicechat/client`. Expected: empty Electron window opens; DevTools console shows no errors. Run `await window.api.getPrefs()` in DevTools — returns prefs object with defaults.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(client): preload bridge exposing typed api"
```

---

## Chunk 5: Renderer scaffolding & Tailwind

### Task 5.1: Tailwind + shadcn base

**Files:**
- Create: `apps/client/tailwind.config.ts`
- Create: `apps/client/postcss.config.js`
- Create: `apps/client/src/renderer/main.tsx`
- Create: `apps/client/src/renderer/index.css`
- Create: `apps/client/src/renderer/lib/cn.ts`
- Create: `apps/client/components.json`

- [ ] **Step 1: Create `apps/client/postcss.config.js`**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 2: Create `apps/client/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(240 4% 16%)',
        input: 'hsl(240 4% 16%)',
        ring: 'hsl(240 5% 65%)',
        background: 'hsl(240 10% 4%)',
        foreground: 'hsl(0 0% 98%)',
        primary: { DEFAULT: 'hsl(263 70% 50%)', foreground: 'hsl(0 0% 98%)' },
        secondary: { DEFAULT: 'hsl(240 4% 16%)', foreground: 'hsl(0 0% 98%)' },
        muted: { DEFAULT: 'hsl(240 4% 16%)', foreground: 'hsl(240 5% 65%)' },
        destructive: { DEFAULT: 'hsl(0 63% 45%)', foreground: 'hsl(0 0% 98%)' },
      },
      borderRadius: { lg: '0.5rem', md: '0.375rem', sm: '0.25rem' },
    },
  },
} satisfies Config;
```

- [ ] **Step 3: Create `apps/client/src/renderer/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; margin: 0; }
body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
```

- [ ] **Step 4: Create `apps/client/src/renderer/lib/cn.ts`**

```ts
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
```

- [ ] **Step 5: Create `apps/client/components.json`** (shadcn marker)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/renderer/index.css",
    "baseColor": "zinc",
    "cssVariables": false
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/cn"
  }
}
```

- [ ] **Step 6: Create `apps/client/src/renderer/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import '@livekit/components-styles';
import { App } from './App.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');
createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 7: Create stub `apps/client/src/renderer/App.tsx`**

```tsx
export function App() {
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="text-2xl font-semibold">VoiceChat</div>
    </div>
  );
}
```

- [ ] **Step 8: Manual verify**

Run `npm run dev -w @voicechat/client`. Expected: dark window with centered "VoiceChat" text.

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat(client): Tailwind + shadcn base + render stub"
```

### Task 5.2: zustand store and API client

**Files:**
- Create: `apps/client/src/renderer/state/store.ts`
- Create: `apps/client/src/renderer/lib/api.ts`
- Create: `apps/client/src/renderer/lib/env.ts`

- [ ] **Step 1: Create `apps/client/src/renderer/lib/env.ts`**

```ts
const url = import.meta.env.VITE_LOBBY_URL ?? 'http://localhost:3000';
export const LOBBY_URL = url.replace(/\/$/, '');
```

- [ ] **Step 2: Create `apps/client/src/renderer/lib/api.ts`**

```ts
import { LOBBY_URL } from './env.js';

export type RoomSummary = {
  id: string;
  displayName: string;
  maxParticipants: number;
  participants: { identity: string; name: string }[];
};

export type JoinResponse = { token: string; livekitUrl: string; identity: string };

export type JoinError =
  | { kind: 'invalid_name' }
  | { kind: 'not_found' }
  | { kind: 'full' }
  | { kind: 'duplicate_name' }
  | { kind: 'network' }
  | { kind: 'server' };

export async function fetchRooms(): Promise<RoomSummary[]> {
  const res = await fetch(`${LOBBY_URL}/api/rooms`);
  if (!res.ok) throw new Error(`rooms fetch failed: ${res.status}`);
  return res.json();
}

export async function postJoin(
  roomId: string,
  displayName: string,
): Promise<JoinResponse | JoinError> {
  let res: Response;
  try {
    res = await fetch(`${LOBBY_URL}/api/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, displayName }),
    });
  } catch {
    return { kind: 'network' };
  }
  if (res.ok) return (await res.json()) as JoinResponse;
  if (res.status === 400) return { kind: 'invalid_name' };
  if (res.status === 404) return { kind: 'not_found' };
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { reason?: string };
    if (body.reason === 'full') return { kind: 'full' };
    if (body.reason === 'duplicate_name') return { kind: 'duplicate_name' };
  }
  return { kind: 'server' };
}
```

- [ ] **Step 3: Create `apps/client/src/renderer/state/store.ts`**

```ts
import { create } from 'zustand';
import type { Prefs } from '../../shared/types.js';
import type { JoinResponse, RoomSummary } from '../lib/api.js';

export type View = 'lobby' | 'room';

export type ChatMessage = {
  id: string;
  fromIdentity: string;
  fromName: string;
  text: string;
  timestamp: number;
};

type Store = {
  view: View;
  prefs: Prefs | null;
  rooms: RoomSummary[];
  roomsLoading: boolean;
  roomsError: string | null;
  activeRoom: { roomId: string; roomName: string; join: JoinResponse } | null;
  chat: ChatMessage[];

  setPrefs(prefs: Prefs): void;
  setRooms(rooms: RoomSummary[]): void;
  setRoomsLoading(v: boolean): void;
  setRoomsError(err: string | null): void;
  enterRoom(payload: { roomId: string; roomName: string; join: JoinResponse }): void;
  leaveRoom(): void;
  pushChat(m: ChatMessage): void;
};

export const useStore = create<Store>((set) => ({
  view: 'lobby',
  prefs: null,
  rooms: [],
  roomsLoading: true,
  roomsError: null,
  activeRoom: null,
  chat: [],
  setPrefs: (prefs) => set({ prefs }),
  setRooms: (rooms) => set({ rooms, roomsLoading: false, roomsError: null }),
  setRoomsLoading: (v) => set({ roomsLoading: v }),
  setRoomsError: (err) => set({ roomsError: err, roomsLoading: false }),
  enterRoom: (payload) => set({ view: 'room', activeRoom: payload, chat: [] }),
  leaveRoom: () => set({ view: 'lobby', activeRoom: null, chat: [] }),
  pushChat: (m) => set((s) => ({ chat: [...s.chat, m] })),
}));
```

- [ ] **Step 4: Bootstrap prefs in `App.tsx`**

```tsx
import { useEffect } from 'react';
import { useStore } from './state/store.js';
import { LobbyView } from './views/LobbyView.js';
import { RoomView } from './views/RoomView.js';

export function App() {
  const { view, prefs, setPrefs } = useStore();

  useEffect(() => {
    window.api.getPrefs().then(setPrefs);
  }, [setPrefs]);

  if (!prefs) return <div className="grid h-screen place-items-center text-zinc-400">…</div>;
  return view === 'lobby' ? <LobbyView /> : <RoomView />;
}
```

- [ ] **Step 5: Create stubs**

`apps/client/src/renderer/views/LobbyView.tsx`:
```tsx
export function LobbyView() {
  return <div className="p-6">Lobby (TBD)</div>;
}
```

`apps/client/src/renderer/views/RoomView.tsx`:
```tsx
export function RoomView() {
  return <div className="p-6">Room (TBD)</div>;
}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(client): zustand store, lobby API client, view stubs"
```

---

## Chunk 6: Lobby view

### Task 6.1: Lobby UI with polling and join flow

**Files:**
- Create: `apps/client/src/renderer/views/LobbyView.tsx` (replace stub)
- Create: `apps/client/src/renderer/components/RoomCard.tsx`
- Create: `apps/client/src/renderer/components/Toast.tsx`
- Create: `apps/client/src/renderer/state/toast-store.ts`
- Create: `apps/client/src/renderer/hooks/usePollRooms.ts`

- [ ] **Step 1: Create toast store `apps/client/src/renderer/state/toast-store.ts`**

```ts
import { create } from 'zustand';

export type ToastKind = 'info' | 'error' | 'success';
export type Toast = { id: string; kind: ToastKind; text: string };

type ToastState = {
  toasts: Toast[];
  push(kind: ToastKind, text: string): void;
  dismiss(id: string): void;
};

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text) => {
    const id = `${Date.now()}-${Math.random()}`;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
```

- [ ] **Step 2: Create `apps/client/src/renderer/components/Toast.tsx`**

```tsx
import { useToasts } from '../state/toast-store.js';
import { cn } from '../lib/cn.js';

export function ToastTray() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            'rounded-md border px-4 py-2 text-sm shadow-lg backdrop-blur',
            t.kind === 'error' && 'border-red-900/50 bg-red-950/90 text-red-100',
            t.kind === 'success' && 'border-emerald-900/50 bg-emerald-950/90 text-emerald-100',
            t.kind === 'info' && 'border-zinc-800 bg-zinc-900/90 text-zinc-100',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/client/src/renderer/hooks/usePollRooms.ts`**

```ts
import { useEffect, useRef } from 'react';
import { fetchRooms } from '../lib/api.js';
import { useStore } from '../state/store.js';

export function usePollRooms(active: boolean): void {
  const { setRooms, setRoomsError, setRoomsLoading } = useStore();
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    stoppedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stoppedRef.current) return;
      try {
        const rooms = await fetchRooms();
        if (!stoppedRef.current) setRooms(rooms);
      } catch (err) {
        if (!stoppedRef.current) setRoomsError((err as Error).message);
      } finally {
        if (!stoppedRef.current) timer = setTimeout(tick, 5000);
      }
    };

    setRoomsLoading(true);
    tick();
    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, setRooms, setRoomsError, setRoomsLoading]);
}
```

- [ ] **Step 4: Create `apps/client/src/renderer/components/RoomCard.tsx`**

```tsx
import { cn } from '../lib/cn.js';
import type { RoomSummary } from '../lib/api.js';

type Props = { room: RoomSummary; disabled?: boolean; onJoin: () => void };

export function RoomCard({ room, disabled, onJoin }: Props) {
  const full = room.participants.length >= room.maxParticipants;
  const active = room.participants.length > 0;
  return (
    <button
      type="button"
      disabled={disabled || full}
      onClick={onJoin}
      className={cn(
        'flex w-full flex-col rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-left transition',
        'hover:border-zinc-700 hover:bg-zinc-900',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 rounded-full', active ? 'bg-emerald-500' : 'bg-zinc-600')} />
          <span className="font-medium">{room.displayName}</span>
        </div>
        <span className="text-sm text-zinc-400">
          {room.participants.length}/{room.maxParticipants}
        </span>
      </div>
      {room.participants.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
          {room.participants.map((p) => (
            <span key={p.identity}>· {p.name}</span>
          ))}
        </div>
      )}
    </button>
  );
}
```

- [ ] **Step 5: Replace `apps/client/src/renderer/views/LobbyView.tsx`**

```tsx
import { useState } from 'react';
import { useStore } from '../state/store.js';
import { useToasts } from '../state/toast-store.js';
import { usePollRooms } from '../hooks/usePollRooms.js';
import { postJoin, type JoinError } from '../lib/api.js';
import { RoomCard } from '../components/RoomCard.js';
import { ToastTray } from '../components/Toast.js';
import { Settings } from 'lucide-react';

const ERROR_MAP: Record<JoinError['kind'], string> = {
  invalid_name: 'Введите корректный ник',
  not_found: 'Комната недоступна',
  full: 'Комната заполнена (8/8)',
  duplicate_name: 'Этот ник уже используется в комнате',
  network: 'Нет соединения с сервером',
  server: 'Ошибка сервера',
};

export function LobbyView() {
  const { rooms, roomsLoading, roomsError, prefs, setPrefs, enterRoom } = useStore();
  const { push } = useToasts();
  const [joining, setJoining] = useState<string | null>(null);
  usePollRooms(true);

  if (!prefs) return null;

  const onNameChange = async (name: string) => {
    const next = await window.api.setPrefs({ displayName: name });
    setPrefs(next);
  };

  const onJoin = async (roomId: string, roomName: string) => {
    if (!prefs.displayName.trim()) {
      push('error', 'Сначала введите ник');
      return;
    }
    setJoining(roomId);
    const result = await postJoin(roomId, prefs.displayName.trim());
    setJoining(null);
    if ('kind' in result) {
      push('error', ERROR_MAP[result.kind]);
      return;
    }
    enterRoom({ roomId, roomName, join: result });
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="text-lg font-semibold">VoiceChat</div>
        <button className="rounded p-2 hover:bg-zinc-800" aria-label="Settings">
          <Settings size={18} />
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-6">
        <label className="mb-6 block">
          <span className="mb-2 block text-sm text-zinc-400">Ваш ник</span>
          <input
            type="text"
            value={prefs.displayName}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={32}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-600"
            placeholder="Введите ник"
          />
        </label>

        <div className="mb-3 text-sm font-medium text-zinc-400">Доступные комнаты</div>
        {roomsLoading && <div className="text-sm text-zinc-500">Загрузка…</div>}
        {roomsError && (
          <div className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
            Не удаётся подключиться к серверу
          </div>
        )}
        <div className="space-y-2">
          {rooms.map((r) => (
            <RoomCard
              key={r.id}
              room={r}
              disabled={joining !== null}
              onJoin={() => onJoin(r.id, r.displayName)}
            />
          ))}
        </div>
      </main>

      <ToastTray />
    </div>
  );
}
```

- [ ] **Step 6: Manual verify**

Start LiveKit and lobby server. Run client with `npm run dev -w @voicechat/client`. Expected:
- Window shows nick (prefilled) and room list
- Editing nick persists across restart
- Polling refreshes count every 5 seconds
- Clicking room with empty nick → toast «Сначала введите ник»
- Clicking valid room → state changes to "room" view (stub renders)

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(client): lobby view with polling and join flow"
```

---

## Chunk 7: Room view — LiveKit connection & controls

### Task 7.1: Connect to LiveKit and basic controls

**Files:**
- Create: `apps/client/src/renderer/views/RoomView.tsx` (replace stub)
- Create: `apps/client/src/renderer/components/ParticipantTile.tsx`
- Create: `apps/client/src/renderer/components/ControlBar.tsx`
- Create: `apps/client/src/renderer/hooks/useLiveKitRoom.ts`

- [ ] **Step 1: Create `apps/client/src/renderer/hooks/useLiveKitRoom.ts`**

```ts
import { useEffect, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type ConnectionState,
  type DisconnectReason,
} from 'livekit-client';
import { useStore } from '../state/store.js';
import { useToasts } from '../state/toast-store.js';

export function useLiveKitRoom() {
  const { activeRoom, prefs, leaveRoom } = useStore();
  const { push } = useToasts();
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<ConnectionState>('disconnected' as ConnectionState);

  useEffect(() => {
    if (!activeRoom || !prefs) return;
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: prefs.audioConstraints.echoCancellation,
        noiseSuppression: prefs.audioConstraints.noiseSuppression,
        autoGainControl: prefs.audioConstraints.autoGainControl,
        deviceId: prefs.audioInputDeviceId ?? undefined,
      },
      videoCaptureDefaults: {
        deviceId: prefs.videoInputDeviceId ?? undefined,
      },
    });

    r.on(RoomEvent.ConnectionStateChanged, setState);
    r.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
      const reasonMap: Record<number, string> = {
        1: 'Подключение из другого окна',
        2: 'Сервер перезапущен',
        3: 'Вы были отключены от комнаты',
        4: 'Связь потеряна',
      };
      const code = reason ?? 0;
      const msg = code === 0 ? null : reasonMap[code] ?? 'Связь потеряна';
      if (msg) push('error', msg);
      leaveRoom();
    });

    (async () => {
      try {
        await r.connect(activeRoom.join.livekitUrl, activeRoom.join.token);
        if (prefs.initialDeviceState.mic) await r.localParticipant.setMicrophoneEnabled(true);
        if (prefs.initialDeviceState.camera) await r.localParticipant.setCameraEnabled(true);
        setRoom(r);
      } catch (err) {
        push('error', `Не удалось подключиться: ${(err as Error).message}`);
        leaveRoom();
      }
    })();

    return () => {
      r.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom?.roomId]);

  return { room, state };
}
```

- [ ] **Step 2: Create `apps/client/src/renderer/components/ParticipantTile.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Track, type Participant } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { cn } from '../lib/cn.js';

export function ParticipantTile({ p, big = false }: { p: Participant; big?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const cam = p.getTrackPublication(Track.Source.Camera);
    if (cam?.track && videoRef.current) cam.track.attach(videoRef.current);
    return () => {
      if (cam?.track && videoRef.current) cam.track.detach(videoRef.current);
    };
  }, [p, p.trackPublications.size]);

  const micPub = p.getTrackPublication(Track.Source.Microphone);
  const camPub = p.getTrackPublication(Track.Source.Camera);
  const speaking = p.isSpeaking;

  return (
    <div
      className={cn(
        'relative flex aspect-video items-center justify-center rounded-lg border bg-zinc-900',
        speaking ? 'border-emerald-500' : 'border-zinc-800',
        big && 'col-span-2 row-span-2',
      )}
    >
      {camPub && !camPub.isMuted ? (
        <video ref={videoRef} className="h-full w-full rounded-lg object-cover" autoPlay playsInline />
      ) : (
        <div className="text-2xl font-semibold text-zinc-500">{p.name?.[0] ?? '?'}</div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs">
        {micPub?.isMuted ? <MicOff size={12} /> : <Mic size={12} />}
        {camPub?.isMuted ? <VideoOff size={12} /> : <Video size={12} />}
        <span>{p.name}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/client/src/renderer/components/ControlBar.tsx`**

```tsx
import { useState } from 'react';
import { Track, type Room } from 'livekit-client';
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff } from 'lucide-react';
import { cn } from '../lib/cn.js';

type Props = {
  room: Room;
  onLeave: () => void;
  onToggleScreenShare: () => void;
  remoteSharing: boolean;
};

export function ControlBar({ room, onLeave, onToggleScreenShare, remoteSharing }: Props) {
  const [micOn, setMicOn] = useState(room.localParticipant.isMicrophoneEnabled);
  const [camOn, setCamOn] = useState(room.localParticipant.isCameraEnabled);
  const localSharing = !!room.localParticipant.getTrackPublication(Track.Source.ScreenShare);

  const toggleMic = async () => {
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  };
  const toggleCam = async () => {
    const next = !camOn;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  };

  return (
    <div className="flex items-center justify-center gap-3 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
      <CtlButton on={micOn} onClick={toggleMic} label="Mic" iconOn={<Mic size={18} />} iconOff={<MicOff size={18} />} />
      <CtlButton on={camOn} onClick={toggleCam} label="Camera" iconOn={<Video size={18} />} iconOff={<VideoOff size={18} />} />
      <CtlButton
        on={localSharing}
        disabled={!localSharing && remoteSharing}
        onClick={onToggleScreenShare}
        label={remoteSharing && !localSharing ? 'Уже идёт демонстрация' : 'Demo'}
        iconOn={<MonitorUp size={18} />}
        iconOff={<MonitorUp size={18} />}
      />
      <button
        onClick={onLeave}
        className="ml-4 flex items-center gap-2 rounded-md bg-red-900/80 px-4 py-2 text-sm hover:bg-red-900"
      >
        <PhoneOff size={16} /> Выйти
      </button>
    </div>
  );
}

function CtlButton({
  on,
  onClick,
  label,
  iconOn,
  iconOff,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  iconOn: React.ReactNode;
  iconOff: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full transition',
        on ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {on ? iconOn : iconOff}
    </button>
  );
}
```

- [ ] **Step 4: Replace `apps/client/src/renderer/views/RoomView.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { RoomEvent, Track, type Participant } from 'livekit-client';
import { useStore } from '../state/store.js';
import { useLiveKitRoom } from '../hooks/useLiveKitRoom.js';
import { ParticipantTile } from '../components/ParticipantTile.js';
import { ControlBar } from '../components/ControlBar.js';
import { ToastTray } from '../components/Toast.js';
import { ChevronLeft } from 'lucide-react';

export function RoomView() {
  const { activeRoom, leaveRoom } = useStore();
  const { room, state } = useLiveKitRoom();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [screenShareParticipant, setScreenShareParticipant] = useState<Participant | null>(null);

  useEffect(() => {
    if (!room) return;
    const refresh = () => {
      const all = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
      setParticipants(all);
      const sharer = all.find((p) => p.getTrackPublication(Track.Source.ScreenShare));
      setScreenShareParticipant(sharer ?? null);
    };
    refresh();
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
    ];
    events.forEach((e) => room.on(e, refresh));
    return () => {
      events.forEach((e) => room.off(e, refresh));
    };
  }, [room]);

  if (!activeRoom) return null;
  const remoteSharing =
    !!screenShareParticipant && screenShareParticipant !== room?.localParticipant;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <button onClick={leaveRoom} className="flex items-center gap-1 rounded p-2 text-sm hover:bg-zinc-800">
          <ChevronLeft size={16} /> {activeRoom.roomName} ({participants.length}/8)
        </button>
        <span className="text-xs text-zinc-500">{state}</span>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <section className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {participants.map((p) => (
              <ParticipantTile key={p.identity} p={p} big={p === screenShareParticipant} />
            ))}
          </div>
        </section>
        {/* Chat panel filled in Chunk 8 */}
      </main>

      {room && (
        <ControlBar
          room={room}
          onLeave={leaveRoom}
          remoteSharing={remoteSharing}
          onToggleScreenShare={() => {
            // Filled in Task 7.2
          }}
        />
      )}
      <ToastTray />
    </div>
  );
}
```

- [ ] **Step 5: Manual verify**

With LiveKit and lobby server running, click a room from lobby. Expected:
- View switches to room
- Local participant tile appears with mic on (per default prefs)
- Camera off by default
- Click mic → mic icon toggles
- Open second client (different nick) → both tiles visible, you hear each other
- Click "Выйти" → returns to lobby

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(client): room view with LiveKit connect, tiles, controls"
```

### Task 7.2: Screen share with custom picker

**Files:**
- Create: `apps/client/src/renderer/components/ScreenSourcePicker.tsx`
- Modify: `apps/client/src/renderer/views/RoomView.tsx`

- [ ] **Step 1: Create picker component**

```tsx
import { useEffect, useState } from 'react';
import type { ScreenSource } from '../../shared/types.js';

type Props = { onPick: (source: ScreenSource) => void; onCancel: () => void };

export function ScreenSourcePicker({ onPick, onCancel }: Props) {
  const [sources, setSources] = useState<ScreenSource[] | null>(null);

  useEffect(() => {
    window.api.getScreenSources().then(setSources);
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6">
      <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Выберите экран или окно</h2>
          <button onClick={onCancel} className="rounded px-3 py-1 text-sm hover:bg-zinc-800">
            Отмена
          </button>
        </div>
        {!sources ? (
          <div className="text-zinc-500">Загрузка…</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {sources.map((s) => (
              <button
                key={s.id}
                onClick={() => onPick(s)}
                className="flex flex-col gap-2 rounded border border-zinc-800 p-2 hover:border-zinc-600"
              >
                <img src={s.thumbnailDataUrl} alt={s.name} className="aspect-video w-full rounded object-cover" />
                <div className="truncate text-xs">{s.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire screen-share toggle in `RoomView.tsx`**

Add state and handler, replace the placeholder `onToggleScreenShare`:

```tsx
const [pickerOpen, setPickerOpen] = useState(false);

const stopShare = async () => {
  if (!room) return;
  const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  if (pub?.track) {
    await room.localParticipant.unpublishTrack(pub.track);
    pub.track.stop();
  }
};

const startShare = async (source: ScreenSource) => {
  if (!room) return;
  setPickerOpen(false);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error chromium-only constraints
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          maxFrameRate: 30,
        },
      },
    });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('no video track');
    await room.localParticipant.publishTrack(track, {
      source: Track.Source.ScreenShare,
      simulcast: false,
    });
    track.addEventListener('ended', () => stopShare());
  } catch (err) {
    console.error(err);
  }
};

const onToggleScreenShare = () => {
  const localSharing = !!room?.localParticipant.getTrackPublication(Track.Source.ScreenShare);
  if (localSharing) stopShare();
  else setPickerOpen(true);
};
```

Add at end of returned JSX, before `<ToastTray />`:

```tsx
{pickerOpen && (
  <ScreenSourcePicker onPick={startShare} onCancel={() => setPickerOpen(false)} />
)}
```

Pass `onToggleScreenShare` to `<ControlBar>`. Import `ScreenSource` from `../../shared/types.js` and `ScreenSourcePicker`.

- [ ] **Step 3: Manual verify**

In a room with two clients, click "Demo" on one. Expected:
- Picker modal opens with screen + window thumbnails
- Pick one → picker closes, big tile with screen content appears for the other client
- "Demo" button on the sharer becomes active/highlighted; button on other client becomes disabled with tooltip
- Click "Demo" again on sharer → unpublishes, big tile disappears

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(client): screen share with custom desktopCapturer picker"
```

---

## Chunk 8: Text chat via data channels

### Task 8.1: Send and receive chat messages

**Files:**
- Create: `apps/client/src/renderer/components/ChatPanel.tsx`
- Modify: `apps/client/src/renderer/views/RoomView.tsx`

- [ ] **Step 1: Create `apps/client/src/renderer/components/ChatPanel.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { RoomEvent, type Room, type RemoteParticipant } from 'livekit-client';
import { Send } from 'lucide-react';
import { useStore } from '../state/store.js';

type WirePayload = { type: 'chat'; text: string; timestamp: number };

export function ChatPanel({ room }: { room: Room }) {
  const { chat, pushChat } = useStore();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onData = (data: Uint8Array, participant?: RemoteParticipant) => {
      const decoded = new TextDecoder().decode(data);
      try {
        const msg = JSON.parse(decoded) as WirePayload;
        if (msg.type !== 'chat') return;
        pushChat({
          id: `${participant?.identity ?? 'remote'}-${msg.timestamp}-${Math.random()}`,
          fromIdentity: participant?.identity ?? 'unknown',
          fromName: participant?.name ?? participant?.identity?.split('#')[0] ?? '?',
          text: msg.text,
          timestamp: msg.timestamp,
        });
      } catch {
        /* ignore */
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, pushChat]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const payload: WirePayload = { type: 'chat', text: trimmed, timestamp: Date.now() };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    await room.localParticipant.publishData(bytes, { reliable: true });
    pushChat({
      id: `local-${payload.timestamp}-${Math.random()}`,
      fromIdentity: room.localParticipant.identity,
      fromName: room.localParticipant.name ?? 'Я',
      text: trimmed,
      timestamp: payload.timestamp,
    });
    setText('');
  };

  return (
    <aside className="flex w-80 flex-col border-l border-zinc-800 bg-zinc-900/30">
      <div className="border-b border-zinc-800 px-4 py-2 text-sm font-medium">Чат</div>
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {chat.map((m) => (
          <div key={m.id} className="rounded bg-zinc-900 p-2">
            <div className="text-xs text-zinc-500">{m.fromName}</div>
            <div className="whitespace-pre-wrap break-words">{m.text}</div>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-zinc-800 p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Сообщение…"
          className="flex-1 rounded bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-600"
        />
        <button type="submit" className="rounded bg-zinc-100 p-2 text-zinc-900 hover:bg-white" aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </aside>
  );
}
```

- [ ] **Step 2: Mount `<ChatPanel>` in `RoomView.tsx`**

In the `<main>` block, after the `<section>`:
```tsx
{room && <ChatPanel room={room} />}
```

- [ ] **Step 3: Manual verify**

Two clients in same room. Send "hello" from client A. Expected: message appears in chat panel of both clients within ms. Newlines preserved (Shift+Enter currently inserts newline). Local message is shown immediately.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(client): text chat via LiveKit data channels"
```

---

## Chunk 9: Settings & push-to-talk

### Task 9.1: Settings modal

**Files:**
- Create: `apps/client/src/renderer/components/SettingsModal.tsx`
- Create: `apps/client/src/renderer/hooks/useDeviceList.ts`
- Modify: `apps/client/src/renderer/views/LobbyView.tsx`
- Modify: `apps/client/src/renderer/views/RoomView.tsx`

- [ ] **Step 1: Create `apps/client/src/renderer/hooks/useDeviceList.ts`**

```ts
import { useEffect, useState } from 'react';

export type DeviceList = {
  audioInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
};

export function useDeviceList(): DeviceList {
  const [list, setList] = useState<DeviceList>({ audioInputs: [], audioOutputs: [], videoInputs: [] });

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        // Permission must be granted at least once for labels to populate.
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then((s) =>
          s.getTracks().forEach((t) => t.stop()),
        ).catch(() => undefined);
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setList({
          audioInputs: devices.filter((d) => d.kind === 'audioinput'),
          audioOutputs: devices.filter((d) => d.kind === 'audiooutput'),
          videoInputs: devices.filter((d) => d.kind === 'videoinput'),
        });
      } catch {
        /* ignore */
      }
    };
    refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', refresh);
    };
  }, []);

  return list;
}
```

- [ ] **Step 2: Create `apps/client/src/renderer/components/SettingsModal.tsx`**

```tsx
import { useState } from 'react';
import { useStore } from '../state/store.js';
import { useDeviceList } from '../hooks/useDeviceList.js';
import type { Prefs } from '../../shared/types.js';

type Props = { onClose: () => void };

export function SettingsModal({ onClose }: Props) {
  const { prefs, setPrefs } = useStore();
  const devices = useDeviceList();
  const [capturing, setCapturing] = useState(false);

  if (!prefs) return null;

  const update = async (patch: Partial<Prefs>) => {
    const next = await window.api.setPrefs(patch);
    setPrefs(next);
  };

  const captureKey = () => {
    setCapturing(true);
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      void update({ pushToTalk: { ...prefs.pushToTalk, key: e.code } });
      setCapturing(false);
      window.removeEventListener('keydown', handler, true);
    };
    window.addEventListener('keydown', handler, true);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-lg font-semibold">Настройки</div>

        <Field label="Микрофон">
          <DeviceSelect
            devices={devices.audioInputs}
            value={prefs.audioInputDeviceId}
            onChange={(v) => update({ audioInputDeviceId: v })}
          />
        </Field>
        <Field label="Камера">
          <DeviceSelect
            devices={devices.videoInputs}
            value={prefs.videoInputDeviceId}
            onChange={(v) => update({ videoInputDeviceId: v })}
          />
        </Field>
        <Field label="Динамики">
          <DeviceSelect
            devices={devices.audioOutputs}
            value={prefs.audioOutputDeviceId}
            onChange={(v) => update({ audioOutputDeviceId: v })}
          />
        </Field>

        <div className="my-4 border-t border-zinc-800" />

        <Toggle
          label="Эхоподавление"
          checked={prefs.audioConstraints.echoCancellation}
          onChange={(v) =>
            update({ audioConstraints: { ...prefs.audioConstraints, echoCancellation: v } })
          }
        />
        <Toggle
          label="Шумоподавление"
          checked={prefs.audioConstraints.noiseSuppression}
          onChange={(v) =>
            update({ audioConstraints: { ...prefs.audioConstraints, noiseSuppression: v } })
          }
        />
        <Toggle
          label="Авто-регулировка громкости"
          checked={prefs.audioConstraints.autoGainControl}
          onChange={(v) =>
            update({ audioConstraints: { ...prefs.audioConstraints, autoGainControl: v } })
          }
        />

        <div className="my-4 border-t border-zinc-800" />

        <Toggle
          label="Push-to-talk"
          checked={prefs.pushToTalk.enabled}
          onChange={(v) => update({ pushToTalk: { ...prefs.pushToTalk, enabled: v } })}
        />
        {prefs.pushToTalk.enabled && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-zinc-400">Клавиша:</span>
            <button
              onClick={captureKey}
              className="rounded border border-zinc-700 px-2 py-1 hover:border-zinc-500"
            >
              {capturing ? 'Нажмите клавишу…' : prefs.pushToTalk.key}
            </button>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded bg-zinc-100 px-3 py-1 text-sm text-zinc-900">
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function DeviceSelect({
  devices,
  value,
  onChange,
}: {
  devices: MediaDeviceInfo[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm"
    >
      <option value="">По умолчанию</option>
      {devices.map((d) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || d.deviceId.slice(0, 8)}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mb-2 flex items-center justify-between text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
```

- [ ] **Step 3: Open settings from header**

Replace the placeholder `<button>` in `LobbyView.tsx` and add same in `RoomView.tsx` with state:

```tsx
const [settingsOpen, setSettingsOpen] = useState(false);
// ... in header:
<button onClick={() => setSettingsOpen(true)} className="rounded p-2 hover:bg-zinc-800" aria-label="Settings">
  <Settings size={18} />
</button>
// ... before </div> root:
{settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
```

- [ ] **Step 4: Manual verify**

Open settings from lobby. Plug/unplug a USB mic — list updates. Toggle echoCancellation — value persists across restart. Capture PTT key (default `AltRight`) and rebind.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(client): settings modal with devices, audio constraints, PTT"
```

### Task 9.2: Push-to-talk runtime

**Files:**
- Create: `apps/client/src/renderer/hooks/usePushToTalk.ts`
- Modify: `apps/client/src/renderer/views/RoomView.tsx`

- [ ] **Step 1: Create hook**

```ts
import { useEffect } from 'react';
import type { Room } from 'livekit-client';
import { useStore } from '../state/store.js';

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

export function usePushToTalk(room: Room | null): void {
  const { prefs } = useStore();

  useEffect(() => {
    if (!room || !prefs?.pushToTalk.enabled) return;
    const key = prefs.pushToTalk.key;

    // While PTT is enabled, mic is muted by default; key press unmutes.
    room.localParticipant.setMicrophoneEnabled(false);

    const onDown = (e: KeyboardEvent) => {
      if (e.code !== key) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (!e.repeat) room.localParticipant.setMicrophoneEnabled(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== key) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      room.localParticipant.setMicrophoneEnabled(false);
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [room, prefs?.pushToTalk.enabled, prefs?.pushToTalk.key]);
}
```

- [ ] **Step 2: Use it in `RoomView.tsx`**

```tsx
import { usePushToTalk } from '../hooks/usePushToTalk.js';
// ...
usePushToTalk(room);
```

- [ ] **Step 3: Manual verify**

Enable PTT in settings with default `AltRight`. Mic stays muted. Hold right Alt → mic unmutes; release → mutes. Type in chat input — pressing right Alt while focus is in input does NOT toggle mic.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(client): push-to-talk runtime with editable-focus guard"
```

---

## Chunk 10: Auto-update integration

### Task 10.1: electron-updater

**Files:**
- Create: `apps/client/electron-builder.yml`
- Modify: `apps/client/src/main/updater.ts`
- Modify: `apps/client/src/main/ipc.ts`
- Create: `apps/client/src/renderer/components/UpdateBanner.tsx`
- Modify: `apps/client/src/renderer/App.tsx`

- [ ] **Step 1: Create `apps/client/electron-builder.yml`**

```yaml
appId: com.example.voicechat
productName: VoiceChat
directories:
  output: release/${version}
files:
  - out/**
  - package.json
win:
  target: nsis
  artifactName: ${productName}-${version}-Setup.${ext}
nsis:
  oneClick: false
  allowToChangeInstallationDir: true
  perMachine: false
publish:
  provider: github
  owner: REPLACE_ME
  repo: voicechat
```

- [ ] **Step 2: Replace `apps/client/src/main/updater.ts`**

```ts
import { autoUpdater } from 'electron-updater';
import type { BrowserWindow } from 'electron';
import { IPC, type UpdateStatus } from '../shared/types.js';

let getWindow: () => BrowserWindow | null = () => null;
let lastStatus: UpdateStatus = { kind: 'idle' };

function emit(status: UpdateStatus): void {
  lastStatus = status;
  getWindow()?.webContents.send(IPC.UpdateStatus, status);
}

export function setupAutoUpdate(getWin: () => BrowserWindow | null): void {
  getWindow = getWin;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => emit({ kind: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    emit({ kind: 'available', version: info.version }),
  );
  autoUpdater.on('update-not-available', () => emit({ kind: 'idle' }));
  autoUpdater.on('download-progress', (p) =>
    emit({ kind: 'downloading', percent: Math.round(p.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    emit({ kind: 'ready', version: info.version }),
  );
  autoUpdater.on('error', (err) => emit({ kind: 'error', message: err.message }));

  // initial check + hourly
  autoUpdater.checkForUpdates().catch(() => undefined);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => undefined), 60 * 60 * 1000);
}

export function getLastStatus(): UpdateStatus {
  return lastStatus;
}

export async function manualCheck(): Promise<void> {
  await autoUpdater.checkForUpdates();
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
```

- [ ] **Step 3: Wire up IPC handlers in `apps/client/src/main/ipc.ts`**

Add at bottom of `registerIpc`:

```ts
ipcMain.handle(IPC.CheckUpdate, async () => {
  const { manualCheck } = await import('./updater.js');
  await manualCheck();
});
ipcMain.handle(IPC.InstallUpdate, async () => {
  const { quitAndInstall } = await import('./updater.js');
  quitAndInstall();
});
```

- [ ] **Step 4: Create `apps/client/src/renderer/components/UpdateBanner.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../shared/types.js';

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  useEffect(() => window.api.onUpdateStatus(setStatus), []);

  if (status.kind !== 'ready') return null;
  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-md border border-emerald-900 bg-emerald-950/90 px-4 py-2 text-sm">
      <span>Доступна версия {status.version}</span>
      <button
        onClick={() => window.api.installUpdate()}
        className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-950"
      >
        Установить и перезапустить
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Mount `<UpdateBanner />` once in `App.tsx`** (after the view).

- [ ] **Step 6: Manual verify**

Run dev — autoUpdater throws "skip checking for updates because the application is not packed" in dev. That's expected. Build a fake release locally:
```
npm run package -w @voicechat/client
```
Verify `release/0.1.0/VoiceChat-0.1.0-Setup.exe` exists. (Full update flow tests on a published GitHub Release — defer to deploy phase.)

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(client): electron-updater with status banner"
```

---

## Chunk 11: Deployment

### Task 11.1: Server Dockerfile

**Files:**
- Create: `apps/server/Dockerfile`
- Create: `apps/server/.dockerignore`

- [ ] **Step 1: Create `apps/server/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/
RUN npm ci --workspace @voicechat/server --include-workspace-root
COPY apps/server ./apps/server
RUN npm run build -w @voicechat/server

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY apps/server/rooms.yaml ./apps/server/rooms.yaml
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create `apps/server/.dockerignore`**

```
node_modules
dist
.env
*.log
```

- [ ] **Step 3: Verify build**

```
docker build -f apps/server/Dockerfile -t voicechat-server .
```
Expected: image builds without error.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(server): Dockerfile for production build"
```

### Task 11.2: docker-compose, Caddy, LiveKit config

**Files:**
- Create: `deploy/docker-compose.yml`
- Create: `deploy/Caddyfile`
- Create: `deploy/livekit.yaml`
- Create: `deploy/README.md`
- Create: `deploy/.env.example`

- [ ] **Step 1: Create `deploy/livekit.yaml`**

```yaml
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true
keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}
log_level: info
```

- [ ] **Step 2: Create `deploy/Caddyfile`**

```
{$LOBBY_DOMAIN} {
    reverse_proxy lobby:3000
}

{$LIVEKIT_DOMAIN} {
    reverse_proxy livekit:7880
}
```

- [ ] **Step 3: Create `deploy/.env.example`**

```
LOBBY_DOMAIN=chat.example.com
LIVEKIT_DOMAIN=livekit.example.com
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=please-change-to-32-plus-chars-random-string
```

- [ ] **Step 4: Create `deploy/docker-compose.yml`**

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      LOBBY_DOMAIN: ${LOBBY_DOMAIN}
      LIVEKIT_DOMAIN: ${LIVEKIT_DOMAIN}
    depends_on:
      - lobby
      - livekit

  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    command: --config /etc/livekit.yaml
    ports:
      - "7881:7881/tcp"
      - "7882:7882/udp"
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml:ro
    environment:
      LIVEKIT_API_KEY: ${LIVEKIT_API_KEY}
      LIVEKIT_API_SECRET: ${LIVEKIT_API_SECRET}

  lobby:
    build:
      context: ..
      dockerfile: apps/server/Dockerfile
    restart: unless-stopped
    environment:
      PORT: 3000
      LIVEKIT_URL: wss://${LIVEKIT_DOMAIN}
      LIVEKIT_API_KEY: ${LIVEKIT_API_KEY}
      LIVEKIT_API_SECRET: ${LIVEKIT_API_SECRET}
      ROOMS_FILE: /app/apps/server/rooms.yaml
      LOG_LEVEL: info
    depends_on:
      - livekit

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 5: Create `deploy/README.md`**

````markdown
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
# отредактировать .env: домены, сгенерировать LIVEKIT_API_SECRET
docker compose up -d --build
```

Caddy автоматически получит TLS-сертификаты Let's Encrypt в течение минуты.

## Проверка
```
curl https://chat.example.com/healthz
# → {"status":"ok"}
curl https://chat.example.com/api/rooms
# → [{"id":"general", ...}]
```

## Изменение списка комнат
Отредактируйте `apps/server/rooms.yaml` в репозитории. Чтобы применить:
```
docker compose restart lobby
```
(Hot-reload работает только если волюм маунтится напрямую — для прода проще рестартануть.)

## Логи
```
docker compose logs -f lobby
docker compose logs -f livekit
```
````

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(deploy): docker-compose with Caddy + LiveKit + lobby"
```

---

## Chunk 12: Final wiring & smoke test

### Task 12.1: Two-client smoke test

- [ ] **Step 1: Start LiveKit dev container**

```
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  -e LIVEKIT_KEYS="devkey: secret-at-least-32-characters-long-here" \
  livekit/livekit-server --dev --bind 0.0.0.0
```

- [ ] **Step 2: Start lobby server**

```
npm run dev:server
```

- [ ] **Step 3: Start two client instances**

In two terminals:
```
npm run dev:client
npm run dev:client
```
(electron-vite supports multiple instances via different OS user contexts; if not, build once and run packaged exe alongside dev.)

- [ ] **Step 4: Walkthrough scenario**

In each window:
1. Set unique nick
2. Join "Общая"
3. Verify both tiles appear
4. Speak — verify two-way audio
5. Toggle camera in one window — other sees video
6. Click "Demo" in one window, pick a screen — other sees big tile
7. Stop demo
8. Type chat messages — both windows see them
9. Try joining same room with same nick from a 3rd window — server returns 409 duplicate_name
10. Open settings, toggle noise suppression off, leave and rejoin — value persisted

- [ ] **Step 5: Document the smoke test**

Add a short section to root `README.md` with the steps above.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: add two-client smoke test"
```

### Task 12.2: First release

- [ ] **Step 1: Set GitHub repo owner in `electron-builder.yml`** (`publish.owner`)

- [ ] **Step 2: Tag and build**

```bash
git tag v0.1.0
git push origin v0.1.0
npm run package -w @voicechat/client
```

- [ ] **Step 3: Manually upload `release/0.1.0/VoiceChat-0.1.0-Setup.exe` and `latest.yml` to a GitHub Release**

(CI for release builds can be added later; not in scope for initial implementation.)

- [ ] **Step 4: Install on a fresh Windows machine**

Verify SmartScreen warning, click through, app launches, can connect to deployed server.

- [ ] **Step 5: Commit version bump**

```bash
git tag -a v0.1.0 -m "First release"
```

---

## Open items (deploy-time, not blocking development)

1. **Domain selection** (`.xyz` paid or DuckDNS free) — needed before Step 11.2 deploy
2. **GitHub repo owner/name** — fill into `electron-builder.yml` before first release
3. **App ID and product name** — currently `com.example.voicechat`; finalize before first signed release (if ever)

---

## Skill references

- @superpowers:subagent-driven-development — preferred execution path
- @superpowers:executing-plans — fallback if no subagents
- @superpowers:verification-before-completion — required before marking each task complete

## Spec link

`docs/superpowers/specs/2026-04-26-voicechat-design.md`

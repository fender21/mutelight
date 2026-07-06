# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MuteBeacon (repo name: mutelight) turns WLED LED strips into a status beacon. It has two halves:

- **Desktop gateway** (repo root, Electron): thin client. Outbound WebSocket bridge to the cloud, local WLED control + mDNS discovery, Discord RPC (the one integration that must run locally), tray with manual overrides. Deliberately has NO device-management UI.
- **Cloud** (`web/`): Express API (port 3001) + WebSocket server (port 3002) + React dashboard (port 5174). SQLite persistence. The dashboard is the single management surface: devices, per-state colors, API keys, integrations, pairing.

Architecture rule (do not regress): every integration triggers via `POST /api/beacon` on the cloud — never via local listeners on the client. Discord is the grandfathered local exception.

## Common Commands

```bash
# Desktop gateway (repo root)
npm run dev              # dev with hot reload (Vite + Electron)
npm run build            # build main + preload + renderer
npm run package          # electron-builder distributables
npm run type-check       # tsc; tsconfig.main.json + tsconfig.renderer.json cover everything

# Cloud
cd web/backend && npm run dev     # ts-node + nodemon; SQLite at ./data (DATABASE_PATH to override)
cd web/backend && npm run type-check
cd web/frontend && npm run dev    # Vite on 5174, /api proxied to 3001
```

## The Bridge Protocol (core contract)

Defined in `web/shared/protocol.ts` (canonical) and MIRRORED at `src/shared/protocol.ts` — separate TS project roots; keep both files identical apart from the header comment.

- Gateway -> cloud WS: `device_auth {deviceToken}`, `status`, `discovery_result`, `state_report`
- Cloud -> gateway WS: `auth_success`, `beacon {state, ttlMs?, source?}`, `config_sync {devices}`, `command (test_flash)`, `error`
- Cloud -> dashboard WS: `gateway_update {gatewayId, online, status?, discovered?}` (dashboard authenticates with `{type:'auth', token: <JWT>}`)
- REST: `/api/pair/start|poll` (public, used by the gateway), `/api/pair/claim` (JWT), `/api/beacon` (API key), `/api/hook/:token` (public inbound webhooks), `/api/devices*`, `/api/keys*`, `/api/gateways*`, `/api/integrations*` (JWT)
- Pairing is TV-style: gateway shows a 6-char code, user enters it in the dashboard, gateway polls until it receives its one-time device token.

## Integration directory

- Curated static catalog in `web/shared/integrations.ts` (`INTEGRATION_CATALOG`): claude-code (hooks-kind), github/stripe/shopify/home-assistant/zapier/ifttt/generic-webhook (webhook-kind), discord (local-kind, informational). Each entry ships setup steps, event examples, and default `TriggerRule`s. This is deliberately NOT a third-party plugin SDK — adding a provider = adding a catalog entry (+ an event extractor case in `hook.routes.ts` if its payload shape is special).
- Instances live in the `integrations` table; webhook-kind instances get a per-instance unguessable `hook_token` — the URL is the credential; deleting the instance revokes it.
- Inbound flow: `POST /api/hook/:token` → per-provider event extraction (github: `X-GitHub-Event` + `payload.action` as `event.action`; stripe: `payload.type`; shopify: `X-Shopify-Topic`; default: `payload.event ?? state ?? type`) → first enabled matching rule wins (exact, trailing `.*` wildcard, or `*`) → `wsServer.sendBeaconToUser`. Unknown tokens get 404, matched/unmatched always 200.
- Advanced Mode (dashboard, per integration) edits the rules array. Semantics: first matching rule wins; a DISABLED matching rule silences the event; instance-level toggle disables everything.
- `/api/beacon` consults hooks-kind instances (Claude Code) via `integrationService.applyBeaconRules` so users can remap/silence states without editing their hook commands; `state:'clear'` always passes through.

## Gateway (Electron) architecture

- `src/main/services/state-manager.service.ts` — THE hub. Sources feed states in; priority `manual(100) > bridge(50) > discord(10)`; TTL support for transient states; single `stateChanged` event drives everything.
- `src/main/ipc/handlers.ts` — `setupStateForwarding()` holds the one fan-out (WLED + tray + renderer). New event sources must register with the StateManager, never fan out directly.
- `src/main/services/bridge.service.ts` — outbound WS to cloud: pairing flow, applies `beacon`/`config_sync`/`command`, streams status + mDNS discovery up. Reconnects with doubling backoff.
- `src/main/services/discord.service.ts` — Discord RPC; emits into StateManager as source 'discord'. Polling + event subscription.
- `src/main/services/wled.service.ts` — WLED HTTP JSON API; brightness 0 = lights off (`on:false`); 3 retries.
- `src/main/services/config.service.ts` — electron-store; devices are a synced CACHE of cloud config (`config_sync` overwrites them), settings include `bridge {serverUrl, apiUrl, dashboardUrl, deviceToken}`.
- Renderer (`src/renderer/src/App.tsx`) — single screen: pairing code / bridge status / Discord status / two local toggles. Keep it minimal; anything device-related belongs in the web dashboard.
- Beacon states are OPEN-ENDED strings (`BeaconState`). Known states get defaults in `src/shared/defaults.ts` (`DEFAULT_STATE_COLORS`, includes `claude-working/attention/done`, `off`). Unknown states with no per-device color are ignored (lights untouched).

## Cloud architecture

- `web/backend/src/services/database.service.ts` — better-sqlite3, schema applied at boot (users, refresh_tokens, gateways, pair_codes, api_keys, wled_devices).
- `web/backend/src/services/beacon.service.ts` — pairing, gateways, API keys (sha256-hashed, `mb_` prefix, full key returned once), managed devices (stateColors stored as JSON).
- `web/backend/src/websocket/server.ts` — singleton `wsServer`; tracks gateway sockets + dashboard sessions per user; pushes `config_sync` on gateway connect and on any device edit; mirrors gateway status/discovery to dashboard sessions.
- Routes in `web/backend/src/routes/`: beacon.routes.ts authenticates by API key, everything else by JWT middleware.
- Backend tsconfig `rootDir` is `..` so `web/shared` compiles in; build output lands at `dist/backend/src`, hence `npm start` runs `node dist/backend/src/index.js`.

## Claude Code integration

Claude Code hooks POST to `/api/beacon` with an API key (snippet generated on the dashboard Integrations page): `Notification` -> `claude-attention` (sticky purple blink), `Stop` -> `claude-done` with `ttlMs` (green flash, then falls back to Discord state). `state: "clear"` releases the bridge override.

## Testing

There are no unit tests yet. Verify client changes with `npm run type-check` + `npm run build`; verify server changes by booting the backend and exercising the REST/WS protocol (an E2E gateway simulator with 19 checks — pairing, WS auth, discovery, config sync, beacon delivery, test flash, live dashboard updates — was used to validate the protocol; it simulates the gateway with plain `ws`).

## Build Configuration

Three Vite configs at the root build the Electron app: `vite.config.main.ts` (CJS -> dist-main, externals include `ws`), `vite.config.preload.ts` (dist-preload), `vite.config.renderer.ts` (dist-renderer). Path aliases: `@main`, `@renderer`, `@shared` (client `src/shared`). The backend/frontend alias `@shared` to `web/shared`.

## Security notes

- Gateway device tokens and API keys are stored hashed (sha256) server-side; pairing codes expire after 10 minutes; device token delivered exactly once via poll.
- JWT secrets default to dev values — `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are required in production (`validateConfig`).
- KNOWN ISSUE: `DISCORD_CLIENT_SECRET` is still hardcoded in `src/shared/constants.ts` and must be rotated + moved to runtime config (tracked separately).

# MuteBeacon

Turn your WLED LED strips into a status beacon. Discord mute state, Claude Code activity, CI results, anything — one light, one glance.

MuteBeacon has two parts:

- **Desktop gateway** (this repo root) — a tiny Electron tray app. It keeps an outbound connection to the MuteBeacon cloud, discovers WLED devices on your LAN, and drives them. Discord RPC runs here too (it's the one integration that must live on your machine).
- **Cloud** (`web/`) — the API + dashboard. All configuration happens here: devices, colors, API keys, integrations. Anything can trigger your lights with one HTTP call.

## How it fits together

```
Claude Code hooks ─┐
CI / webhooks ─────┼─▶ POST /api/beacon ─▶ cloud ─▶ WSS ─▶ gateway ─▶ WLED devices
phone shortcuts ───┘                                          ▲
                                            Discord RPC ──────┘ (local only)
```

The gateway holds a `StateManager` that resolves one effective state from all
sources by priority: **manual (tray) > cloud beacons > Discord**. Transient
states (e.g. a green "Claude finished" flash) carry a TTL and automatically
fall back to whatever is underneath.

## Quick start (development)

```bash
# 1. Cloud API + WebSocket (port 3001 / 3002)
cd web/backend && npm install && npm run dev

# 2. Dashboard (port 5174)
cd web/frontend && npm install && npm run dev

# 3. Desktop gateway
npm install && npm run dev
```

## Onboarding flow (what a user does)

1. Install and launch the desktop app — it shows a **6-character pairing code**.
2. Sign in to the dashboard, type in the code. Done — the computer is linked.
3. WLED devices on your network **appear automatically** in the dashboard
   (the gateway streams mDNS discovery results up). Click **Add**, hit
   **Test flash** to confirm which strip it is, tweak per-state colors if
   you want.
4. Optional: on the **Integrations** page, create an API key and copy the
   generated Claude Code hooks snippet into `~/.claude/settings.json`.

There is no device management in the desktop app — the dashboard is the
single management surface. The gateway caches config locally, so
Discord → lights keeps working when your internet is down (cloud triggers
obviously don't).

## Triggering the beacon

```bash
curl -X POST https://<your-server>/api/beacon \
  -H "Authorization: Bearer mb_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"state": "claude-attention", "source": "claude"}'
```

- `state`: any string. Known states have default colors (`muted`, `connected`,
  `deafened`, `streaming`, `speaking`, `idle`, `off`, `claude-working`,
  `claude-attention`, `claude-done`); unknown states use the per-device colors
  you configure in the dashboard.
- `ttlMs` (optional): auto-clear after this many ms (e.g. a 4-second flash).
- `state: "clear"`: release the trigger and fall back to Discord/manual.

## Tray menu

Right-click the tray icon for manual overrides: **Set Muted / Set Unmuted /
Lights Off / Resume Automatic**. Manual overrides beat everything else.

## Development commands

```bash
npm run dev          # gateway with hot reload
npm run build        # build main + preload + renderer
npm run package      # electron-builder distributables
npm run type-check   # tsc over the whole client

cd web/backend && npm run dev    # API (3001) + WS (3002), SQLite in ./data
cd web/frontend && npm run dev   # dashboard on 5174
```

## Configuration

Gateway settings live in electron-store (`%APPDATA%/mutelight`). The bridge
endpoints default to `localhost` and can be changed in settings storage:
`bridge.serverUrl` (WS), `bridge.apiUrl` (REST), `bridge.dashboardUrl`.

Server env (`web/backend/.env`): `PORT` (3001), `WS_PORT` (3002),
`DATABASE_PATH` (SQLite file), `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
(required in production), `CORS_ORIGIN`.

## Troubleshooting

- **Pairing code won't appear** — the gateway can't reach the API server;
  check `bridge.apiUrl` and that the backend is running.
- **Discord not connecting** — Discord desktop app must be running (RPC
  doesn't work with the browser client). Lights still work via cloud
  triggers and the tray menu.
- **WLED device offline** — confirm it's on the same subnet and
  `http://<device-ip>` loads in a browser.

## Logs

- Gateway: `%APPDATA%\mutelight\logs\` (Windows), `~/Library/Logs/mutelight/`
  (macOS), `~/.config/mutelight/logs/` (Linux)
- Server: console in dev, `logs/` in production

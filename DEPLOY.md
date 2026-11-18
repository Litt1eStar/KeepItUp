# Keep It Up! Deployment Guide

Self-contained deployment instructions for **Keep It Up!** (`node:22-alpine` multi-stage build + zero-dependency `server.mjs`).

## 1. Architecture & Runtime
- **Build**: Vite + TypeScript static bundle (`npm run build` outputs `dist/`, with fonts `@fontsource/anton` and `@fontsource/space-mono` bundled locally for offline booth play).
- **Runtime**: Node.js `>=22` (`node server.mjs`, zero runtime npm dependencies).
- **Port**: `8643` (HTTP, serves static `dist/` and `GET /api/health` — intentionally distinct from `8642` so it can run alongside TickLock on the same host).
- **Persistence**: Leaderboard scores are stored client-side in browser `localStorage` (`keepitup.leaderboard.v1`), so no server database is required.
- **Healthcheck**: `GET /api/health` (returns HTTP `200` `{"ok":true,"service":"keep-it-up"}`).

## 2. Docker Compose Deployment (Recommended)

### Initial Setup
```bash
git clone https://github.com/Litt1eStar/KeepItUp.git /opt/keepitup
cd /opt/keepitup
docker compose up -d --build
```

### Updating an Existing Deployment
```bash
cd /opt/keepitup
git pull
docker compose up -d --build
```

If `git pull` fails due to local edits in `docker-compose.yml` (e.g., custom port overrides on the server), stash or use `.env` instead:
```bash
git stash
git pull
docker compose up -d --build
```
Prefer putting server-specific overrides in `/opt/keepitup/.env` rather than editing `docker-compose.yml` directly.

## 3. Environment Variables

Configure via `.env` next to `docker-compose.yml` or container environment:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8643` | Host port mapped to container port `8643` (`${PORT:-8643}:8643` in `docker-compose.yml`). |
| `HOST` | `0.0.0.0` | Bind address inside container. |
| `TZ` | `Asia/Bangkok` | Container timezone. |

## 4. Verification
After `docker compose up -d --build`:
```bash
docker compose ps
curl -fsS http://127.0.0.1:8643/api/health
```
Or open `http://127.0.0.1:8643` in a browser.

## 5. Reverse Proxy (Nginx / Caddy)
If placing behind HTTPS/domain:
- Proxy `/` to `http://127.0.0.1:8643` (or `${PORT}`).
- No WebSockets are required; standard HTTP/1.1 or HTTP/2 proxy pass is sufficient.

## 6. Local / Offline Booth Run (Without Docker)
```bash
npm ci
npm run build
npm start
```
Then open `http://127.0.0.1:8643` in Chrome/Edge (fullscreen recommended).

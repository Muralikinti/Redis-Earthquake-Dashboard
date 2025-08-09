# Real-Time Earthquake Analytics (USGS + Redis)

Live demo: [quake-dashboard.onrender.com](https://quake-dashboard.onrender.com/)

Ingests USGS earthquakes (last hour) into Redis and serves a live dashboard:
- Live quake map and recent list
- Magnitude histogram and quakes-per-minute
- Top regions by activity (rolling 60 minutes)

## Features
- Real-time ingest from USGS feed with dedupe and per-minute bucketing
- Live UI with Leaflet and Chart.js, WebSockets for streaming updates
- Rolling 15m/60m leaderboards and histograms computed in Redis
- Observability: health checks, structured logs, Prometheus metrics

## Quick start (local)
1. Start Redis:
```powershell
docker compose up -d
```
2. Install and run:
```powershell
npm install
npm start
```
3. Open `http://localhost:3000`

## Config (.env)
- `REDIS_URL` (default `redis://localhost:6379`)
- `PORT` (default `3000`)
- `USGS_POLL_MS` (default `15000`)

## Architecture
- Ingestor: polls USGS, dedupes by id, writes to `stream:quakes`, maintains per-minute counters, region zsets, and mag histogram buckets
- Aggregator: periodically rolls up last 15/60 minute keys into leaderboards and histograms
- Web server: Express + WebSocket; serves REST for initial state and pushes live quake events
- Frontend: Leaflet map, charts, and leaderboards with a selectable time window

## Redis keys
- `stream:quakes` fields: `id, mag, place, lat, lon, ts`
- `list:recent_quakes` latest 200
- `cnt:quakes:per_minute:[yyyymmddHHmm]`
- `z:quakes:by_region:bucket:[yyyymmddHHmm]`
- `z:quakes:by_region:15m` and `z:quakes:by_region:60m`
- `h:mag_hist:15m` and `h:mag_hist:60m`
- `seen:quake:[id]` (TTL)

## Endpoints
- `GET /api/initial` – initial metrics and recent list
- `GET /api/aggregates?window=15|60` – rolling aggregates
- `GET /healthz` – health check
- `GET /metrics` – Prometheus metrics

## Observability
- Logs: pino structured logging via `pino-http`
- Metrics (Prometheus):
  - `http_request_duration_seconds` labeled by method, route, status
  - `ingest_events_total`, `ingest_new_events_total`
  - `ingest_lag_seconds` (event age vs processing time)
  - `ws_connections` (current WebSocket clients)
- Verify locally at `http://localhost:3000/metrics`

## Self-host on Render
Option A — Blueprint (recommended)
1. Push this repo to GitHub
2. In Render: New → Blueprint → select your repo
3. Confirm branch `main` and apply. The provided `render.yaml` will create:
   - Web service `quake-dashboard`
   - Managed Redis `quake-redis` with `REDIS_URL` auto-wired
4. After deploy, open your URL and verify `/healthz` and `/metrics`

Option B — Manual
1. Create a new Web Service from this repo
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Add env var `REDIS_URL` pointing to your Redis
5. Optional: set `USGS_POLL_MS=15000`

Notes for Render
- Free web services auto-suspend when idle. First request wakes them; the initial request may take 20–60s. While suspended the ingestor is paused; Redis remains up.
- To keep ingest always-on, upgrade the plan or split the ingestor into a Worker service.
- The blueprint sets Redis `ipAllowList` to `0.0.0.0/0` for convenience. For production, restrict this to your web service or trusted IPs.

## Screenshots
- Live map, per-minute chart, magnitude histogram, and top regions (see `public/`)

## License
MIT

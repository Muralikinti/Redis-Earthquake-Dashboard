# Real-Time Earthquake Analytics (USGS + Redis)

Ingests USGS earthquakes (last hour) into Redis and serves a live dashboard:
- Live quake map and recent list
- Magnitude histogram and quakes-per-minute
- Top regions by activity (rolling 60 minutes)

## Quick start
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

## Deploy on Render
Option A — One-click blueprint
1. Push this repo to GitHub
2. On Render, click New > Blueprint and select your repo
3. Accept the `render.yaml` defaults; Render will create a free web service and a free Redis instance and auto-wire `REDIS_URL`

Option B — Manual
1. Create a new Web Service on Render from this repo
2. Set Build Command: `npm install`
3. Set Start Command: `npm start`
4. Add Environment Variable `REDIS_URL` pointing to a Render Redis or any hosted Redis
5. Optional: set `USGS_POLL_MS` to 15000

After deploy, open the service URL and verify `/healthz` and `/metrics`.

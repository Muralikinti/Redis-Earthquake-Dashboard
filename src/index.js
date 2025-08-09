require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const Redis = require('ioredis');
const { WebSocketServer } = require('ws');
const pino = require('pino');
const pinoHttp = require('pino-http');
const { startIngestor } = require('./ingestor');
const { startAggregator } = require('./aggregator');
const { getPrevMinuteBuckets, minuteBucketToISO } = require('./utils/time');
const metrics = require('./metrics');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const USGS_POLL_MS = process.env.USGS_POLL_MS ? Number(process.env.USGS_POLL_MS) : 15000;

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = express();
app.use(cors());
app.use(compression());
app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const redis = new Redis(REDIS_URL, { lazyConnect: true });
redis.on('ready', () => logger.info({ msg: 'redis ready' }));
redis.on('connect', () => logger.info({ msg: 'redis connect' }));
redis.on('reconnecting', () => logger.warn({ msg: 'redis reconnecting' }));
redis.on('error', (e) => logger.error({ err: e }, 'redis error'));

function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

wss.on('connection', (socket) => {
  metrics.wsConnections.inc();
  socket.on('close', () => metrics.wsConnections.dec());
  socket.on('pong', () => {});
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.ping();
  });
}, 30_000);

async function getInitialData() {
  const minutes = getPrevMinuteBuckets(60);
  const pipeline = redis.pipeline();
  minutes.forEach((m) => pipeline.get(`cnt:quakes:per_minute:${m}`));
  pipeline.zrevrange('z:quakes:by_region:60m', 0, 9, 'WITHSCORES');
  pipeline.hgetall('h:mag_hist:60m');
  pipeline.lrange('list:recent_quakes', 0, 199);
  const res = await pipeline.exec();

  const perMinuteCounts = minutes.map((m, idx) => ({
    minute: minuteBucketToISO(m),
    count: Number(res[idx][1] || 0),
  }));

  const regionsRaw = res[minutes.length][1] || [];
  const regionsTop = [];
  for (let i = 0; i < regionsRaw.length; i += 2) {
    regionsTop.push({ region: regionsRaw[i], count: Number(regionsRaw[i + 1]) });
  }

  const histogram = res[minutes.length + 1][1] || {};

  const recentRaw = res[minutes.length + 2][1] || [];
  const recent = recentRaw.map((s) => {
    try { return JSON.parse(s); } catch { return null; }
  }).filter(Boolean);

  return { perMinuteCounts, regionsTop, histogram, recent };
}

app.get('/healthz', (req, res) => {
  metrics.observeHttp(req, res, '/healthz');
  res.json({ ok: true });
});

app.get('/metrics', async (req, res) => {
  metrics.observeHttp(req, res, '/metrics');
  res.set('Content-Type', metrics.client.register.contentType);
  res.end(await metrics.client.register.metrics());
});

app.get('/api/initial', async (req, res) => {
  metrics.observeHttp(req, res, '/api/initial');
  try {
    const data = await getInitialData();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'failed_to_load' });
  }
});

app.get('/api/aggregates', async (req, res) => {
  metrics.observeHttp(req, res, '/api/aggregates');
  const win = Number(req.query.window || 60);
  const safeWin = win === 15 ? 15 : 60;
  try {
    const [regionsRaw, histogram] = await redis
      .pipeline()
      .zrevrange(`z:quakes:by_region:${safeWin}m`, 0, 9, 'WITHSCORES')
      .hgetall(`h:mag_hist:${safeWin}m`)
      .exec()
      .then((rows) => [rows[0][1] || [], rows[1][1] || {}]);

    const regionsTop = [];
    for (let i = 0; i < regionsRaw.length; i += 2) {
      regionsTop.push({ region: regionsRaw[i], count: Number(regionsRaw[i + 1]) });
    }
    res.json({ window: safeWin, regionsTop, histogram });
  } catch (e) {
    res.status(500).json({ error: 'failed_to_load' });
  }
});

function main() {
  startIngestor(redis, broadcast, USGS_POLL_MS);
  startAggregator(redis);

  server.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });
}

main();

const client = require('prom-client');

// Default metrics
client.collectDefaultMetrics({ prefix: 'quake_' });

// HTTP server metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

// Ingest metrics
const ingestEvents = new client.Counter({
  name: 'ingest_events_total',
  help: 'Total ingested quake events',
});

const ingestNewEvents = new client.Counter({
  name: 'ingest_new_events_total',
  help: 'Total new (deduped) quake events written',
});

const ingestLag = new client.Gauge({
  name: 'ingest_lag_seconds',
  help: 'Age difference between event time and processing time in seconds',
});

// WebSocket metrics
const wsConnections = new client.Gauge({
  name: 'ws_connections',
  help: 'Current number of WebSocket clients',
});

function observeHttp(req, res, routeLabel) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const diffNs = Number(process.hrtime.bigint() - start);
    const seconds = diffNs / 1e9;
    httpRequestDuration.labels(req.method, routeLabel, String(res.statusCode)).observe(seconds);
  });
}

module.exports = {
  client,
  httpRequestDuration,
  ingestEvents,
  ingestNewEvents,
  ingestLag,
  wsConnections,
  observeHttp,
};

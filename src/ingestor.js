const axios = require('axios');
const { getMinuteBucketFromMs, getMagnitudeBin } = require('./utils/time');
const { ingestEvents, ingestNewEvents, ingestLag } = require('./metrics');

const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';

function extractRegion(place) {
  if (!place) return 'Unknown';
  const idx = place.lastIndexOf(',');
  if (idx !== -1) return place.slice(idx + 1).trim();
  const ofIdx = place.toLowerCase().indexOf(' of ');
  if (ofIdx !== -1) return place.slice(ofIdx + 4).trim();
  return place.trim();
}

async function fetchFeed() {
  const res = await axios.get(USGS_URL, { timeout: 10_000 });
  return res.data;
}

async function processFeature(redis, feature, broadcast) {
  ingestEvents.inc();

  const id = feature.id;
  const props = feature.properties || {};
  const geom = feature.geometry || {};
  const coords = Array.isArray(geom.coordinates) ? geom.coordinates : [null, null, null];
  const lon = coords[0];
  const lat = coords[1];
  const ts = props.time; // ms epoch
  const mag = props.mag != null ? Number(props.mag) : null;
  const place = props.place || '';
  const region = extractRegion(place);

  if (!ts || lat == null || lon == null) return false;

  const now = Date.now();
  ingestLag.set((now - ts) / 1000);

  const seenKey = `seen:quake:${id}`;
  const isNew = await redis.set(seenKey, '1', 'EX', 7200, 'NX');
  if (!isNew) return false;

  ingestNewEvents.inc();

  const record = { id, mag, place, lat, lon, ts };

  // Stream
  await redis.xadd(
    'stream:quakes',
    '*',
    'id', id,
    'mag', mag == null ? '' : String(mag),
    'place', place,
    'lat', String(lat),
    'lon', String(lon),
    'ts', String(ts)
  );

  // Recent list (keep latest 200)
  await redis.pipeline()
    .lpush('list:recent_quakes', JSON.stringify(record))
    .ltrim('list:recent_quakes', 0, 199)
    .exec();

  // Per-minute count
  const minute = getMinuteBucketFromMs(ts);
  await redis.incr(`cnt:quakes:per_minute:${minute}`);
  await redis.expire(`cnt:quakes:per_minute:${minute}`, 3 * 3600);

  // Region buckets per-minute
  await redis.zincrby(`z:quakes:by_region:bucket:${minute}`, 1, region);
  await redis.expire(`z:quakes:by_region:bucket:${minute}`, 3 * 3600);

  // Magnitude histogram per-minute
  const bin = getMagnitudeBin(mag);
  await redis.hincrby(`h:mag_hist:bucket:${minute}`, bin, 1);
  await redis.expire(`h:mag_hist:bucket:${minute}`, 3 * 3600);

  // Broadcast to clients
  if (broadcast) {
    broadcast({ type: 'quake', data: record });
  }

  return true;
}

function startIngestor(redis, broadcast, pollMs) {
  let timer = null;
  let running = false;

  async function tick() {
    if (running) return; // prevent overlap
    running = true;
    try {
      const feed = await fetchFeed();
      const features = (feed && feed.features) || [];
      for (const f of features) {
        // eslint-disable-next-line no-await-in-loop
        await processFeature(redis, f, broadcast);
      }
    } catch (err) {
      console.error('Ingest error:', err.message);
    } finally {
      running = false;
    }
  }

  timer = setInterval(tick, pollMs);
  // Kick off quickly
  setTimeout(tick, 2000);

  return () => clearInterval(timer);
}

module.exports = { startIngestor };

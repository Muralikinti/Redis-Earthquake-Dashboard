const { getPrevMinuteBuckets } = require('./utils/time');

async function recomputeRegionsWindow(redis, minutes) {
  const buckets = getPrevMinuteBuckets(minutes);
  const keys = buckets.map((m) => `z:quakes:by_region:bucket:${m}`);
  if (keys.length === 0) return;
  const outKey = `z:quakes:by_region:${minutes}m`;
  try {
    await redis.zunionstore(outKey, keys.length, ...keys);
    await redis.expire(outKey, 180);
  } catch (e) {
    // ignore if unsupported signature
  }
}

async function recomputeHistogramWindow(redis, minutes) {
  const buckets = getPrevMinuteBuckets(minutes);
  const outKey = `h:mag_hist:${minutes}m`;
  const bins = new Map();
  for (const m of buckets) {
    // eslint-disable-next-line no-await-in-loop
    const h = await redis.hgetall(`h:mag_hist:bucket:${m}`);
    Object.entries(h || {}).forEach(([bin, count]) => {
      const prev = bins.get(bin) || 0;
      bins.set(bin, prev + Number(count));
    });
  }
  if (bins.size > 0) {
    const flat = [];
    bins.forEach((v, k) => flat.push(k, String(v)));
    await redis.hset(outKey, ...flat);
    await redis.expire(outKey, 180);
  } else {
    await redis.del(outKey);
  }
}

function startAggregator(redis) {
  const run = async () => {
    try {
      await Promise.all([
        recomputeRegionsWindow(redis, 15),
        recomputeRegionsWindow(redis, 60),
        recomputeHistogramWindow(redis, 15),
        recomputeHistogramWindow(redis, 60),
      ]);
    } catch (e) {
      // ignore
    }
  };

  run();
  const t = setInterval(run, 30_000);
  return () => clearInterval(t);
}

module.exports = { startAggregator };

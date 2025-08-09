const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);

function getMinuteBucketFromMs(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  return `${y}${m}${day}${hh}${mm}`; // yyyymmddHHmm in UTC
}

function getCurrentMinuteBucket() {
  return getMinuteBucketFromMs(Date.now());
}

function getPrevMinuteBuckets(count) {
  const list = [];
  const now = Date.now();
  for (let i = count - 1; i >= 0; i -= 1) {
    const ms = now - i * 60_000;
    list.push(getMinuteBucketFromMs(ms));
  }
  return list;
}

function minuteBucketToISO(minBucket) {
  const y = Number(minBucket.slice(0, 4));
  const m = Number(minBucket.slice(4, 6));
  const d = Number(minBucket.slice(6, 8));
  const hh = Number(minBucket.slice(8, 10));
  const mm = Number(minBucket.slice(10, 12));
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  return dt.toISOString();
}

function getMagnitudeBin(mag) {
  if (mag == null || Number.isNaN(mag)) return 'unknown';
  if (mag < 0) return '<0';
  if (mag >= 9) return '9+';
  const floored = Math.floor(mag);
  return `${floored}-${floored + 1}`;
}

module.exports = {
  getMinuteBucketFromMs,
  getCurrentMinuteBucket,
  getPrevMinuteBuckets,
  minuteBucketToISO,
  getMagnitudeBin,
};

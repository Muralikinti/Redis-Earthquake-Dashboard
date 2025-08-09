/* global L, Chart */
const map = L.map('map').setView([20, 0], 2);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 10,
  attribution: '© OpenStreetMap contributors © CARTO',
}).addTo(map);

const markers = L.layerGroup().addTo(map);
const recentList = document.getElementById('recent-list');
const regionsList = document.getElementById('regions-list');
const windowSelect = document.getElementById('window-select');
const winLabel1 = document.getElementById('win-label-1');
const winLabel2 = document.getElementById('win-label-2');
const totalCountEl = document.getElementById('total-count');
const lastUpdateEl = document.getElementById('last-update');

let perMinuteChart;
let histChart;

function addRecentItem(item) {
  const li = document.createElement('li');
  const when = new Date(item.ts).toISOString().slice(11, 19);
  const magTxt = item.mag == null ? 'N/A' : item.mag.toFixed(1);
  li.textContent = `${when} • M${magTxt} • ${item.place}`;
  recentList.prepend(li);
  while (recentList.children.length > 200) recentList.removeChild(recentList.lastChild);
}

function addMarker(item) {
  const mag = item.mag == null ? 0 : item.mag;
  const base = mag >= 6 ? '#ff4d6d' : mag >= 5 ? '#ff9f40' : mag >= 4 ? '#ffd166' : '#4f8cff';
  const radius = Math.max(6, Math.min(26, (mag + 1) * 3));

  // Halo behind
  const halo = L.circleMarker([item.lat, item.lon], {
    radius: radius + 5,
    color: base,
    opacity: 0.5,
    fillColor: base,
    fillOpacity: 0.15,
    weight: 2,
    interactive: false,
  }).addTo(markers);

  // Core with white outline
  const core = L.circleMarker([item.lat, item.lon], {
    radius,
    color: '#ffffff',
    opacity: 0.9,
    weight: 2,
    fillColor: base,
    fillOpacity: 0.85,
  }).addTo(markers);

  const when = new Date(item.ts).toISOString();
  core.bindPopup(`<strong>M${mag.toFixed(1)}</strong><br/>${item.place}<br/>${when}`);
  if (core.bringToFront) core.bringToFront();
}

function initPerMinuteChart(data) {
  const ctx = document.getElementById('perMinuteChart');
  const labels = data.map((d) => d.minute.slice(11, 16));
  const values = data.map((d) => d.count);
  perMinuteChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Quakes/min', data: values, fill: true, borderColor: '#4f8cff', backgroundColor: 'rgba(79, 140, 255, 0.15)', tension: 0.3, pointRadius: 2 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' } }, x: { grid: { color: 'rgba(255,255,255,0.06)' } } } },
  });
}

function initHistChart(hist) {
  const binsOrder = ['<0','0-1','1-2','2-3','3-4','4-5','5-6','6-7','7-8','8-9','9+','unknown'];
  const labels = binsOrder;
  const values = labels.map((b) => Number(hist[b] || 0));
  const ctx = document.getElementById('histChart');
  histChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Count', data: values, backgroundColor: '#10b981' }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' } }, x: { grid: { color: 'rgba(255,255,255,0.06)' } } } },
  });
}

function renderRegions(regionsTop) {
  regionsList.innerHTML = '';
  regionsTop.forEach((r, idx) => {
    const li = document.createElement('li');
    li.textContent = `${idx + 1}. ${r.region} — ${r.count}`;
    regionsList.appendChild(li);
  });
}

function updatePerMinuteOnTick(ts) {
  if (!perMinuteChart) return;
  const minute = new Date(ts);
  const label = minute.toISOString().slice(11, 16);
  const labels = perMinuteChart.data.labels;
  const data = perMinuteChart.data.datasets[0].data;
  if (labels[labels.length - 1] === label) {
    data[data.length - 1] += 1;
  } else {
    labels.push(label);
    data.push(1);
    if (labels.length > 60) { labels.shift(); data.shift(); }
  }
  perMinuteChart.update('none');
}

function updateHistogramOnTick(mag) {
  if (!histChart) return;
  const bins = histChart.data.labels;
  function binOf(m) {
    if (m == null || Number.isNaN(m)) return 'unknown';
    if (m < 0) return '<0';
    if (m >= 9) return '9+';
    const f = Math.floor(m); return `${f}-${f + 1}`;
  }
  const b = binOf(mag);
  const idx = bins.indexOf(b);
  if (idx >= 0) histChart.data.datasets[0].data[idx] += 1;
  histChart.update('none');
}

async function loadAggregates(windowMinutes) {
  try {
    const resp = await fetch(`/api/aggregates?window=${windowMinutes}`);
    const data = await resp.json();
    // Update labels
    const label = `last ${data.window}m`;
    winLabel1.textContent = label;
    winLabel2.textContent = label;
    document.getElementById('regions-window').textContent = label;
    // Update regions
    renderRegions(data.regionsTop);
    // Update histogram from server snapshot
    if (histChart) {
      const labels = histChart.data.labels;
      histChart.data.datasets[0].data = labels.map((b) => Number(data.histogram[b] || 0));
      histChart.update('none');
    }
    // Total count = sum of histogram
    const total = Object.values(data.histogram || {}).reduce((a, b) => a + Number(b || 0), 0);
    totalCountEl.textContent = total.toString();
    lastUpdateEl.textContent = new Date().toLocaleTimeString();
  } catch (e) {
    // ignore
  }
}

async function refreshAggregates() {
  const win = Number(windowSelect.value || 60);
  await loadAggregates(win);
}

(async function init() {
  const resp = await fetch('/api/initial');
  const initial = await resp.json();

  // Map markers + recent list
  markers.clearLayers();
  initial.recent.slice().reverse().forEach((item) => { addMarker(item); addRecentItem(item); });

  // Charts
  initPerMinuteChart(initial.perMinuteCounts);
  initHistChart(initial.histogram);
  renderRegions(initial.regionsTop);

  // Periodic aggregates refresh
  setInterval(refreshAggregates, 30_000);

  // React to window changes
  windowSelect.addEventListener('change', refreshAggregates);

  // WebSocket
  const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${wsProtocol}://${location.host}/ws`);
  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'quake') {
      addMarker(msg.data);
      addRecentItem(msg.data);
      updatePerMinuteOnTick(msg.data.ts);
      updateHistogramOnTick(msg.data.mag);
      // regions leaderboard handled by periodic update
    }
  };

  // Initial aggregates load to sync with selector
  refreshAggregates();
})();

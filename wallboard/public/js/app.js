const REFRESH_MS = 60 * 1000;
const STALE_MS = 2 * 60 * 1000;

let lastFetch = null;

function getStatus(metric, val) {
  if (val == null) return 'neutral';
  const rules = {
    sinResponder: [[0, 3, 'verde'], [4, 8, 'amarillo'], [9, Infinity, 'rojo']],
    masAntiguo:   [[0, 0.33, 'verde'], [0.34, 0.75, 'amarillo'], [0.76, Infinity, 'rojo']],
    frtHoy:       [[0, 29, 'verde'], [30, 45, 'amarillo'], [46, Infinity, 'rojo']],
    colaTotal:    [[0, 14, 'verde'], [15, 30, 'amarillo'], [31, Infinity, 'rojo']],
    pctSla:       [[90.01, 100, 'verde'], [75, 90, 'amarillo'], [0, 74.99, 'rojo']],
  }[metric] || [];
  for (const [min, max, s] of rules) if (val >= min && val <= max) return s;
  return 'neutral';
}

function setCard(id, value, displayText, metric) {
  const card = document.getElementById(id);
  const valEl = document.getElementById('val-' + id.replace('card-', ''));
  if (!card || !valEl) return;
  if (displayText != null) valEl.textContent = displayText;
  card.dataset.status = getStatus(metric, value);
}

function updateSemaforos(s) {
  const { sinResponder, masAntiguo, frtHoy, pctSla, colaTotal } = s;

  setCard('card-sin-responder', sinResponder?.valor, sinResponder?.valor ?? '—', 'sinResponder');
  setCard('card-mas-antiguo', masAntiguo?.valor,
    masAntiguo?.valor != null ? `${masAntiguo.valor} h` : '—', 'masAntiguo');
  setCard('card-frt', frtHoy?.valor,
    frtHoy?.valor != null ? `${frtHoy.valor} min` : '—', 'frtHoy');
  setCard('card-sla', pctSla?.valor,
    pctSla?.valor != null ? `${pctSla.valor.toFixed(1)}%` : '—', 'pctSla');
  setCard('card-cola', colaTotal?.valor, colaTotal?.valor ?? '—', 'colaTotal');

  const frtBig = document.getElementById('frt-big');
  if (frtBig) frtBig.textContent = frtHoy?.valor != null ? `${frtHoy.valor}` : '—';

  const frtSla = document.getElementById('frt-sla-mini');
  if (frtSla) frtSla.textContent = pctSla?.valor != null ? `${pctSla.valor.toFixed(1)}%` : '—';
}

function updateBarras(semaforos, today) {
  const entrantes = today?.tickets_entrantes ?? 0;
  const resueltos = today?.tickets_resueltos ?? 0;
  const cola = semaforos?.colaTotal?.valor ?? 0;
  const maxVal = Math.max(entrantes, resueltos, cola, 1);

  document.getElementById('bar-val-entrantes').textContent = entrantes;
  document.getElementById('bar-val-resueltos').textContent = resueltos;
  document.getElementById('bar-val-cola').textContent = cola;

  document.getElementById('bar-fill-entrantes').style.width = `${(entrantes / maxVal) * 100}%`;
  document.getElementById('bar-fill-resueltos').style.width = `${(resueltos / maxVal) * 100}%`;
  document.getElementById('bar-fill-cola').style.width = `${(cola / maxVal) * 100}%`;
}

function updateAgentes(agentes) {
  const el = document.getElementById('agentes-list');
  if (!el) return;
  if (!agentes || !agentes.length) { el.innerHTML = '<div style="color:var(--muted)">Sin datos</div>'; return; }

  const max = Math.max(...agentes.map(a => a.abiertos), 1);
  el.innerHTML = agentes.map(a => `
    <div class="agente-row">
      <span class="agente-nombre">${a.nombre}</span>
      <div class="agente-bar-track">
        <div class="agente-bar-fill" style="width:${(a.abiertos / max) * 100}%"></div>
      </div>
      <span class="agente-count">${a.abiertos}</span>
    </div>
  `).join('');
}

function updateCanales(porCanal) {
  const map = {};
  (porCanal || []).forEach(c => { map[c.canal] = c.count; });
  ['email', 'whatsapp', 'instagram', 'facebook'].forEach(c => {
    const el = document.getElementById('c-' + c);
    if (el) el.textContent = map[c] ?? 0;
  });
}

function updateMarcas(porMarca) {
  const map = {};
  (porMarca || []).forEach(m => { map[m.marca] = m.count; });
  ['chile', 'españa', 'alemania', 'usa', 'europa'].forEach(m => {
    const el = document.getElementById('m-' + m);
    if (el) el.textContent = map[m] ?? 0;
  });
}

function updateZombies(count) {
  const el = document.getElementById('val-zombies');
  const badge = document.getElementById('zombie-badge');
  if (el) el.textContent = count ?? 0;
  if (badge) badge.className = 'zombie-badge' + (count > 0 ? ' alerta' : '');
}

function updateLastUpdate(ts) {
  const el = document.getElementById('last-update');
  if (!el || !ts) return;
  el.textContent = new Date(ts).toLocaleTimeString('es-CL');
}

async function fetchHeatmap() {
  try {
    const res = await fetch('/api/metrics/heatmap');
    if (!res.ok) return;
    const { data } = await res.json();
    renderHeatmap(data);
    renderWeeklyChart(data);
  } catch {}
}

function renderHeatmap(data) {
  const grid = document.getElementById('heatmap-grid');
  if (!grid) return;

  const byCell = {};
  let maxVal = 1;
  (data || []).forEach(d => {
    const date = new Date(d.fecha_hora);
    const day = date.getDay();
    const hour = date.getHours();
    const key = `${day}_${hour}`;
    byCell[key] = (byCell[key] || 0) + (d.tickets_entrantes || 0);
    if (byCell[key] > maxVal) maxVal = byCell[key];
  });

  grid.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    for (let d = 0; d < 7; d++) {
      const val = byCell[`${d}_${h}`] || 0;
      const intensity = Math.round((val / maxVal) * 100);
      const cell = document.createElement('div');
      cell.className = 'hm-cell';
      cell.title = `${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d]} ${h}:00 — ${val} tickets`;
      cell.style.background = val === 0
        ? 'var(--border)'
        : `rgba(96,165,250,${0.15 + (intensity / 100) * 0.85})`;
      grid.appendChild(cell);
    }
  }
}

function renderWeeklyChart(data) {
  const svg = document.getElementById('weekly-chart');
  if (!svg) return;

  const byDay = {};
  (data || []).forEach(d => {
    const day = d.fecha_hora.split('T')[0];
    if (!byDay[day]) byDay[day] = { e: 0, r: 0 };
    byDay[day].e += d.tickets_entrantes || 0;
    byDay[day].r += d.tickets_resueltos || 0;
  });

  const days = Object.keys(byDay).sort().slice(-7);
  if (!days.length) return;

  const W = 400, H = 160, pad = 20;
  const maxV = Math.max(...days.flatMap(d => [byDay[d].e, byDay[d].r]), 1);
  const xStep = (W - pad * 2) / (days.length - 1 || 1);
  const yScale = v => H - pad - ((v / maxV) * (H - pad * 2));

  const pts = (key) => days.map((d, i) => `${pad + i * xStep},${yScale(byDay[d][key])}`).join(' ');

  svg.innerHTML = `
    <polyline points="${pts('e')}" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linejoin="round"/>
    <polyline points="${pts('r')}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linejoin="round"/>
    ${days.map((d, i) => `
      <circle cx="${pad + i * xStep}" cy="${yScale(byDay[d].e)}" r="3" fill="#60a5fa"/>
      <circle cx="${pad + i * xStep}" cy="${yScale(byDay[d].r)}" r="3" fill="#10b981"/>
      <text x="${pad + i * xStep}" y="${H - 2}" text-anchor="middle" fill="#6b7280" font-size="10">
        ${d.slice(5)}
      </text>
    `).join('')}
    <text x="8" y="16" fill="#60a5fa" font-size="10" font-weight="bold">Entrantes</text>
    <text x="80" y="16" fill="#10b981" font-size="10" font-weight="bold">Resueltos</text>
  `;
}

function updateClock() {
  const now = new Date();
  const t = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const d = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('clock').textContent = t;
  document.getElementById('date').textContent = d;

  const badge = document.getElementById('live-badge');
  if (badge && lastFetch && Date.now() - lastFetch > STALE_MS) {
    badge.className = 'live-badge stale';
    badge.lastElementChild.textContent = 'DATOS VIEJOS';
  } else if (badge) {
    badge.className = 'live-badge';
    badge.lastElementChild.textContent = 'EN VIVO';
  }
}

async function fetchMetrics() {
  try {
    const res = await fetch('/api/metrics/live');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    lastFetch = Date.now();

    updateSemaforos(data.semaforos);
    updateBarras(data.semaforos, data.today);
    updateAgentes(data.agentes);
    updateCanales(data.porCanal);
    updateMarcas(data.porMarca);
    updateZombies(data.zombies);
    updateLastUpdate(data.lastUpdate);
  } catch (err) {
    console.error('Error al obtener métricas:', err);
  }
}

function init() {
  updateClock();
  setInterval(updateClock, 1000);

  fetchMetrics();
  fetchHeatmap();
  setInterval(fetchMetrics, REFRESH_MS);
  setInterval(fetchHeatmap, 10 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);

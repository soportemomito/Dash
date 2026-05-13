const REFRESH_MS = 5 * 1000;

let lastFetch = null;

function getStatus(metric, val) {
  if (val == null) return 'neutral';
  const rules = {
    sinResponder: [[0, 10, 'verde'], [11, 20, 'amarillo'], [30, Infinity, 'rojo']],
    masAntiguo: [[0, 0.33, 'verde'], [0.34, 0.75, 'amarillo'], [0.76, Infinity, 'rojo']],
    frtHoy: [[0, 29, 'verde'], [30, 45, 'amarillo'], [46, Infinity, 'rojo']],
    colaTotal: [[0, 14, 'verde'], [15, 30, 'amarillo'], [31, Infinity, 'rojo']],
    pctSla: [[90.01, 100, 'verde'], [75, 90, 'amarillo'], [0, 74.99, 'rojo']],
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
}

function updateAgentes(agentes) {
  const el = document.getElementById('agentes-list');
  if (!el) return;

  const filtered = (agentes || []).filter(a => a.tipo !== 'bot');
  if (!filtered.length) { el.innerHTML = '<div style="color:var(--muted)">Sin datos</div>'; return; }

  const max = Math.max(...filtered.map(a => a.abiertos), 1);
  el.innerHTML = filtered.map(a => {
    const unasigned = a.tipo === 'sin_asignar';
    return `
      <div class="agente-row${unasigned ? ' sin-asignar' : ''}">
        <span class="agente-nombre">${unasigned ? '⚠ Sin asignar' : a.nombre}</span>
        <div class="agente-bar-track">
          <div class="agente-bar-fill${unasigned ? ' sin-asignar' : ''}" style="width:${(a.abiertos / max) * 100}%"></div>
        </div>
        <span class="agente-count">${a.abiertos}</span>
      </div>
    `;
  }).join('');
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
  const hd = document.getElementById('header-update');
  const time = ts ? new Date(ts).toLocaleTimeString('es-CL') : null;
  if (el && time) el.textContent = time;
  if (hd && time) hd.textContent = `Act. ${time}`;
}


function updateClock() {
  const now = new Date();
  const t = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const d = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('clock').textContent = t;
  document.getElementById('date').textContent = d;
}

async function fetchMetrics() {
  try {
    const res = await fetch('/api/metrics/live');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    lastFetch = Date.now();

    updateSemaforos(data.semaforos);
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
  setInterval(fetchMetrics, REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', init);

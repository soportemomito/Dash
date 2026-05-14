const express = require('express');
const path = require('path');
const supabase = require('../sync/supabase');
const sheets = require('../sync/sheets');
const events = require('../events');

const app = express();
const sseClients = new Set();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/ping', (_req, res) => res.send('pong'));

function getSemaforoStatus(metric, value) {
  if (value == null) return 'neutral';
  const t = {
    sinResponder: [[0, 3, 'verde'], [4, 8, 'amarillo'], [9, Infinity, 'rojo']],
    masAntiguo:   [[0, 0.33, 'verde'], [0.34, 0.75, 'amarillo'], [0.76, Infinity, 'rojo']],
    frtHoy:       [[0, 29, 'verde'], [30, 45, 'amarillo'], [46, Infinity, 'rojo']],
    colaTotal:    [[0, 14, 'verde'], [15, 30, 'amarillo'], [31, Infinity, 'rojo']],
    pctSla:       [[90.01, 100, 'verde'], [75, 90, 'amarillo'], [0, 74.99, 'rojo']],
  }[metric] || [];
  for (const [min, max, status] of t) {
    if (value >= min && value <= max) return status;
  }
  return 'neutral';
}

async function computeLiveMetrics() {
  const { tickets, today } = await supabase.getLiveData();

  const allQueue = tickets.filter(t => ['open', 'pending'].includes(t.estado));
  const queue = allQueue.filter(t => t.agente_nombre !== 'Bot');
  const open = tickets.filter(t => t.estado === 'open' && t.agente_nombre !== 'Bot');
  const unanswered = open.filter(t => t.waiting_since);

  const oldest = unanswered.sort(
    (a, b) => new Date(a.waiting_since) - new Date(b.waiting_since)
  )[0];
  const oldestHours = oldest
    ? parseFloat(((Date.now() - new Date(oldest.waiting_since)) / 3600000).toFixed(1))
    : 0;

  const twoHAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const zombies = open.filter(
    t => t.agente_id && t.ultima_actividad_en && new Date(t.ultima_actividad_en) < twoHAgo
  ).length;

  const frtMin = today.frt_promedio_seg ? Math.round(today.frt_promedio_seg / 60) : null;
  const pctSla = today.pct_sla ? parseFloat(today.pct_sla) : null;

  const canalCount = {};
  const marcaCount = {};
  const agenteCount = {};

  queue.forEach(t => {
    canalCount[t.canal || 'otro'] = (canalCount[t.canal || 'otro'] || 0) + 1;
    marcaCount[t.marca || 'global'] = (marcaCount[t.marca || 'global'] || 0) + 1;
  });

  unanswered.forEach(t => {
    const nombre = t.agente_nombre || 'Sin asignar';
    agenteCount[nombre] = (agenteCount[nombre] || 0) + 1;
  });

  const agentes = Object.entries(agenteCount)
    .map(([nombre, count]) => ({
      nombre,
      abiertos: count,
      tipo: nombre === 'Sin asignar' ? 'sin_asignar' : 'humano',
    }))
    .sort((a, b) => b.abiertos - a.abiertos);

  return {
    semaforos: {
      sinResponder: { valor: unanswered.length, status: getSemaforoStatus('sinResponder', unanswered.length) },
      masAntiguo:   { valor: oldestHours, unidad: 'h', status: getSemaforoStatus('masAntiguo', oldestHours) },
      frtHoy:       { valor: frtMin, unidad: 'min', status: getSemaforoStatus('frtHoy', frtMin) },
      pctSla:       { valor: pctSla, unidad: '%', status: getSemaforoStatus('pctSla', pctSla) },
      colaTotal:    { valor: queue.length, status: getSemaforoStatus('colaTotal', queue.length) },
    },
    today: {
      tickets_entrantes: today.tickets_entrantes || 0,
      tickets_resueltos: today.tickets_resueltos || 0,
    },
    zombies,
    agentes,
    porCanal: Object.entries(canalCount).map(([canal, count]) => ({ canal, count })),
    porMarca: Object.entries(marcaCount).map(([marca, count]) => ({ marca, count })),
    lastUpdate: new Date().toISOString(),
  };
}

events.on('synced', async () => {
  if (!sseClients.size) return;
  try {
    const data = await computeLiveMetrics();
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => client.write(payload));
  } catch (err) {
    console.error('[sse] broadcast error:', err.message);
  }
});

app.get('/api/metrics/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.get('/api/metrics/live', async (req, res) => {
  try {
    res.json(await computeLiveMetrics());
  } catch (err) {
    console.error('/api/metrics/live:', err.message);
    res.status(500).json({ error: 'Error al obtener métricas' });
  }
});

app.get('/api/debug/st', (req, res) => {
  const data = sheets.getMetrics();
  res.json(data || { error: 'aún no cargado' });
});

app.get('/api/metrics/st', (req, res) => {
  const data = sheets.getMetrics();
  if (!data) return res.status(503).json({ error: 'Cargando datos ST...' });
  res.json(data);
});

app.get('/api/debug/unanswered', async (req, res) => {
  try {
    const { tickets } = await supabase.getLiveData();
    const open = tickets.filter(t => t.estado === 'open' && t.agente_nombre !== 'Bot');
    const unanswered = open.filter(t => t.waiting_since);
    res.json({
      total_open_no_bot: open.length,
      total_unanswered: unanswered.length,
      tickets: unanswered.map(t => ({
        id: t.id,
        agente_nombre: t.agente_nombre,
        agente_id: t.agente_id,
        canal: t.canal,
        marca: t.marca,
        waiting_since: t.waiting_since,
        ultima_actividad_en: t.ultima_actividad_en,
        creado_en: t.creado_en,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/metrics/heatmap', async (req, res) => {
  try {
    const data = await supabase.getHeatmapData();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener heatmap' });
  }
});

function start(port) {
  app.listen(port, () => {
    console.log(`[server] Wallboard en http://localhost:${port}`);
  });
}

module.exports = { start };

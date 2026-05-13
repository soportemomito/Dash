const express = require('express');
const path = require('path');
const supabase = require('../sync/supabase');

const app = express();

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

app.get('/api/metrics/live', async (req, res) => {
  try {
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

    allQueue.forEach(t => {
      const nombre = t.agente_nombre || 'Sin asignar';
      agenteCount[nombre] = (agenteCount[nombre] || 0) + 1;
    });

    const agentes = Object.entries(agenteCount)
      .map(([nombre, abiertos]) => ({
        nombre,
        abiertos,
        tipo: nombre === 'Sin asignar' ? 'sin_asignar' : nombre === 'Bot' ? 'bot' : 'humano',
      }))
      .sort((a, b) => b.abiertos - a.abiertos);

    res.json({
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
    });
  } catch (err) {
    console.error('/api/metrics/live:', err.message);
    res.status(500).json({ error: 'Error al obtener métricas' });
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

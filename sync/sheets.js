const axios = require('axios');

const SPREADSHEET_ID = '1nYvYZ65w7ZMXQd0eJZIF4qUh_T92qelJUY1GeIY7fiQ';
const FILTER_FROM = new Date('2026-01-01');

let cachedMetrics = null;

function parseCSV(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const fields = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(field); field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field);
    rows.push(fields);
  }
  return rows;
}

function parseDate(str) {
  if (!str) return null;
  const [d, m, y] = str.trim().split('/');
  if (!d || !m || !y) return null;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

function getOrigen(orden = '') {
  const o = orden.trim().replace(/^X/i, '');
  const match = o.match(/^([A-Za-z]+)/);
  return match ? match[1].toUpperCase() : 'Recepción';
}

async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const { data } = await axios.get(url, { timeout: 15000, responseType: 'text' });
  return parseCSV(data);
}

async function runSheetsSync() {
  try {
    const [entradas, recepcion, salida, salidaDist] = await Promise.all([
      fetchSheet('Entradas'),
      fetchSheet('Entrada Recepción'),
      fetchSheet('Salida'),
      fetchSheet('SalidaDist'),
    ]);

    // Entradas: A=status, B=orden, C=fecha
    const entradasRows = entradas.slice(1)
      .map(r => ({ status: r[0]?.trim().toUpperCase(), orden: r[1]?.trim(), fecha: parseDate(r[2]) }))
      .filter(r => r.fecha && r.fecha >= FILTER_FROM);

    // Entrada Recepción: A=status, C=orden, D=fecha
    const recepcionRows = recepcion.slice(1)
      .map(r => ({ status: r[0]?.trim().toUpperCase(), orden: r[2]?.trim(), fecha: parseDate(r[3]) }))
      .filter(r => r.fecha && r.fecha >= FILTER_FROM);

    const all = [
      ...entradasRows.map(r => ({ ...r, tipo: 'dist' })),
      ...recepcionRows.map(r => ({ ...r, tipo: 'rec' })),
    ];

    const pendientes = all.filter(r => r.status !== 'LISTO');
    const completados = all.filter(r => r.status === 'LISTO');

    const oldest = [...pendientes].sort((a, b) => a.fecha - b.fecha)[0];
    const oldestDias = oldest
      ? Math.floor((Date.now() - oldest.fecha) / 86400000)
      : null;

    // Duración: Salida col AC (index 28), SalidaDist col AB (index 27)
    // Filtrar por Fecha Salida col C (index 2)
    const durations = [];
    salida.slice(1).forEach(r => {
      const fecha = parseDate(r[2]);
      if (fecha && fecha >= FILTER_FROM) {
        const val = parseFloat(r[28]);
        if (!isNaN(val) && val > 0) durations.push(val);
      }
    });
    salidaDist.slice(1).forEach(r => {
      const fecha = parseDate(r[2]);
      if (fecha && fecha >= FILTER_FROM) {
        const val = parseFloat(r[27]);
        if (!isNaN(val) && val > 0) durations.push(val);
      }
    });

    const tiempoPromedio = durations.length
      ? parseFloat((durations.reduce((s, v) => s + v, 0) / durations.length).toFixed(1))
      : null;

    const origenMap = {};
    all.forEach(r => {
      const o = getOrigen(r.orden);
      origenMap[o] = (origenMap[o] || 0) + 1;
    });

    cachedMetrics = {
      pendientes: pendientes.length,
      completados: completados.length,
      masAntiguo: oldestDias,
      tiempoPromedio,
      pendientesList: pendientes
        .sort((a, b) => a.fecha - b.fecha)
        .map(r => ({ orden: r.orden, tipo: r.tipo, dias: Math.floor((Date.now() - r.fecha) / 86400000) })),
      porOrigen: Object.entries(origenMap).map(([origen, count]) => ({ origen, count })),
      lastUpdate: new Date().toISOString(),
    };

    console.log(`[sheets] ${pendientes.length} pendientes, ${completados.length} completados — ${new Date().toLocaleTimeString('es-CL')}`);
  } catch (err) {
    console.error('[sheets] Error:', err.message);
  }
}

function getMetrics() { return cachedMetrics; }

module.exports = { runSheetsSync, getMetrics };

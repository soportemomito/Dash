const axios = require('axios');
const crypto = require('crypto');

const SPREADSHEET_ID = '1nYvYZ65w7ZMXQd0eJZIF4qUh_T92qelJUY1GeIY7fiQ';
const FILTER_FROM = new Date('2026-01-01');

let cachedMetrics = null;
let lastError = null;
let tokenCache = null;
let tokenExpiry = 0;

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken() {
  if (tokenCache && Date.now() < tokenExpiry - 60000) return tokenCache;
  const sa = JSON.parse(process.env.GOOGLE_SA_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  }));
  const unsigned = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const sig = sign.sign(sa.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${unsigned}.${sig}`;

  const { data } = await axios.post(
    'https://oauth2.googleapis.com/token',
    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  tokenCache  = data.access_token;
  tokenExpiry = Date.now() + 3600000;
  return tokenCache;
}

async function batchGet(token, ranges) {
  const params = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}&valueRenderOption=FORMATTED_VALUE`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000,
  });
  return data.valueRanges.map(vr => vr.values || []);
}

function parseDate(str) {
  if (!str) return null;
  const s = str.trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function getOrigen(orden = '') {
  const o = orden.trim().replace(/^X/i, '');
  const m = o.match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : 'Recepción';
}

async function runSheetsSync() {
  console.log('[sheets] iniciando sync...');
  try {
    if (!process.env.GOOGLE_SA_KEY) throw new Error('GOOGLE_SA_KEY no configurada');
    const token = await getAccessToken();

    // Entradas: A=status, B=orden, C=fecha
    // Entrada Recepción: A=status, C=orden, D=fecha
    // Salida: C=fecha_salida, AC=duracion
    // SalidaDist: C=fecha_salida, AB=duracion
    const [entradas, recepcion, salidaFechas, salidaDur, salidaDistFechas, salidaDistDur] =
      await batchGet(token, [
        'Entradas!A:C',
        'Entrada Recepción!A:D',
        'Salida!C:C',
        'Salida!AC:AC',
        'SalidaDist!C:C',
        'SalidaDist!AB:AB',
      ]);

    console.log(`[sheets] filas — Entradas:${entradas.length} Recepcion:${recepcion.length} Salida:${salidaFechas.length}`);

    // Parsear entradas (skip header fila 0)
    const entradasRows = entradas.slice(1).map(r => ({
      status: (r[0] || '').trim().toUpperCase(),
      orden:  (r[1] || '').trim(),
      fecha:  parseDate(r[2]),
    })).filter(r => r.fecha && r.fecha >= FILTER_FROM);

    const recepcionRows = recepcion.slice(1).map(r => ({
      status: (r[0] || '').trim().toUpperCase(),
      orden:  (r[2] || '').trim(),
      fecha:  parseDate(r[3]),
    })).filter(r => r.fecha && r.fecha >= FILTER_FROM);

    const all = [
      ...entradasRows.map(r => ({ ...r, tipo: 'dist' })),
      ...recepcionRows.map(r => ({ ...r, tipo: 'rec' })),
    ];

    const pendientes  = all.filter(r => r.status !== 'LISTO');
    const completados = all.filter(r => r.status === 'LISTO');

    const oldest = [...pendientes].sort((a, b) => a.fecha - b.fecha)[0];
    const oldestDias = oldest
      ? Math.floor((Date.now() - oldest.fecha) / 86400000)
      : null;

    // Duraciones (skip header, filtrar por fecha >= 2026)
    const durations = [];
    salidaFechas.slice(1).forEach((r, i) => {
      const fecha = parseDate(r[0]);
      if (!fecha || fecha < FILTER_FROM) return;
      const val = parseFloat((salidaDur[i + 1] || [])[0]);
      if (!isNaN(val) && val > 0) durations.push(val);
    });
    salidaDistFechas.slice(1).forEach((r, i) => {
      const fecha = parseDate(r[0]);
      if (!fecha || fecha < FILTER_FROM) return;
      const val = parseFloat((salidaDistDur[i + 1] || [])[0]);
      if (!isNaN(val) && val > 0) durations.push(val);
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
      pendientes:    pendientes.length,
      completados:   completados.length,
      masAntiguo:    oldestDias,
      tiempoPromedio,
      pendientesList: pendientes
        .sort((a, b) => a.fecha - b.fecha)
        .map(r => ({ orden: r.orden, tipo: r.tipo, dias: Math.floor((Date.now() - r.fecha) / 86400000) })),
      porOrigen: Object.entries(origenMap).map(([origen, count]) => ({ origen, count })),
      lastUpdate: new Date().toISOString(),
    };

    console.log(`[sheets] ${pendientes.length} pendientes, ${completados.length} completados, ${durations.length} duraciones`);
  } catch (err) {
    lastError = err.message;
    console.error('[sheets] Error:', err.message);
  }
}

function getMetrics()   { return cachedMetrics; }
function getLastError() { return lastError; }

module.exports = { runSheetsSync, getMetrics, getLastError };

const axios = require('axios');
const config = require('../config');

const http = axios.create({
  baseURL: `${config.chatwoot.baseUrl}/api/v1/accounts/${config.chatwoot.accountId}`,
  headers: { api_access_token: config.chatwoot.apiToken },
  timeout: 15000,
});

let inboxCache = null;

function parseCanal(channelType = '') {
  if (channelType.includes('Email')) return 'email';
  if (channelType.includes('Facebook')) return 'facebook';
  if (channelType.includes('Instagram')) return 'instagram';
  if (channelType.includes('Whatsapp') || channelType.includes('WhatsApp')) return 'whatsapp';
  return 'otro';
}

function parseMarca(inboxName = '') {
  const n = inboxName.toLowerCase();
  if (n.includes('chile')) return 'chile';
  if (n.includes('españa') || n.includes('spain')) return 'españa';
  if (n.includes('alemania') || n.includes('germany')) return 'alemania';
  if (n.includes('usa')) return 'usa';
  if (n.includes('europa') || n.includes('europe')) return 'europa';
  return 'global';
}

async function getInboxMap() {
  if (inboxCache) return inboxCache;
  const { data } = await http.get('/inboxes');
  const inboxes = data?.payload || [];
  inboxCache = {};
  for (const inbox of inboxes) {
    inboxCache[inbox.id] = {
      nombre: inbox.name,
      canal: parseCanal(inbox.channel_type),
      marca: parseMarca(inbox.name),
    };
  }
  return inboxCache;
}

async function fetchAllByStatus(status) {
  const all = [];
  let page = 1;
  while (true) {
    const { data } = await http.get('/conversations', { params: { status, page } });
    const payload = data?.data?.payload || [];
    all.push(...payload);
    if (payload.length < 25) break;
    page++;
  }
  return all;
}

async function getAllOpenPending() {
  const [open, pending] = await Promise.all([
    fetchAllByStatus('open'),
    fetchAllByStatus('pending'),
  ]);
  return [...open, ...pending];
}

async function getDailySummary() {
  const now = Math.floor(Date.now() / 1000);
  const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const { data } = await http.get('/reports/summary', {
    params: { since: startOfDay, until: now, type: 'account' },
  });
  return data;
}

async function getAgentSummary(agentId) {
  const now = Math.floor(Date.now() / 1000);
  const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const { data } = await http.get('/reports/summary', {
    params: { since: startOfDay, until: now, type: 'agent', id: agentId },
  });
  return data;
}

function resolveAgentName(assignee, estado) {
  if (!assignee) {
    return estado === 'pending' ? 'Bot' : 'Sin asignar';
  }
  const id = String(assignee.id);
  if (config.agents.botIds.has(id)) return 'Bot';
  return config.agents.nameMap[id] || `Agente ${assignee.id}`;
}

function mapConversation(conv, inboxMap = {}) {
  const assignee = conv.meta?.assignee;
  const team = conv.meta?.team;
  const inbox = inboxMap[conv.inbox_id] || {};
  const channelType = conv.meta?.channel || '';

  const creado = conv.created_at ? new Date(conv.created_at * 1000) : null;
  const primeraResp = conv.first_reply_created_at
    ? new Date(conv.first_reply_created_at * 1000)
    : null;
  const frtSeg = creado && primeraResp
    ? Math.floor((primeraResp - creado) / 1000)
    : null;

  return {
    id: conv.id,
    estado: conv.status,
    prioridad: conv.priority || null,
    canal: inbox.canal || parseCanal(channelType),
    marca: inbox.marca || 'global',
    inbox_id: conv.inbox_id,
    inbox_nombre: inbox.nombre || null,
    agente_id: assignee?.id || null,
    agente_nombre: resolveAgentName(assignee, conv.status),
    equipo_id: team?.id || null,
    equipo_nombre: team?.name || null,
    cliente_id: conv.meta?.sender?.id || null,
    creado_en: creado?.toISOString() || null,
    primera_respuesta_en: primeraResp?.toISOString() || null,
    resuelto_en: conv.resolved_at ? new Date(conv.resolved_at * 1000).toISOString() : null,
    ultima_actividad_en: conv.last_activity_at
      ? new Date(conv.last_activity_at * 1000).toISOString()
      : null,
    frt_segundos: frtSeg,
    art_segundos: null,
    sla_cumplido: frtSeg !== null ? frtSeg <= 2700 : null,
    labels: conv.labels || [],
    waiting_since: conv.waiting_since && conv.waiting_since > 0
      ? new Date(conv.waiting_since * 1000).toISOString()
      : null,
  };
}

module.exports = {
  getAllOpenPending,
  getDailySummary,
  getAgentSummary,
  getInboxMap,
  mapConversation,
};

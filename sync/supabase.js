const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const db = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: { persistSession: false },
});

async function upsertTickets(tickets) {
  if (!tickets.length) return;
  const rows = tickets.map(t => ({ ...t, synced_at: new Date().toISOString() }));
  const { error } = await db.from('cs_tickets_snapshot').upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

async function deleteStale() {
  const staleTime = new Date(Date.now() - 90 * 1000).toISOString();
  const { error } = await db.from('cs_tickets_snapshot').delete().lt('synced_at', staleTime);
  if (error) throw error;
}

async function upsertDailyMetrics(metrics) {
  const { error } = await db
    .from('cs_metricas_diarias')
    .upsert({ ...metrics, updated_at: new Date().toISOString() }, { onConflict: 'fecha' });
  if (error) throw error;
}

async function upsertHourlyMetrics(metrics) {
  const { error } = await db
    .from('cs_metricas_horarias')
    .upsert(metrics, { onConflict: 'fecha_hora' });
  if (error) throw error;
}

async function getLiveData() {
  const today = new Date().toISOString().split('T')[0];
  const [ticketsRes, todayRes] = await Promise.all([
    db.from('cs_tickets_snapshot').select('*'),
    db.from('cs_metricas_diarias')
      .select('frt_promedio_seg, pct_sla, tickets_resueltos, tickets_entrantes')
      .eq('fecha', today)
      .maybeSingle(),
  ]);
  if (ticketsRes.error) throw ticketsRes.error;
  return {
    tickets: ticketsRes.data || [],
    today: todayRes.data || {},
  };
}

async function getHeatmapData() {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);
  const { data, error } = await db
    .from('cs_metricas_horarias')
    .select('fecha_hora, tickets_entrantes, tickets_resueltos')
    .gte('fecha_hora', since.toISOString())
    .order('fecha_hora', { ascending: true });
  if (error) throw error;
  return data || [];
}

module.exports = {
  db,
  upsertTickets,
  deleteStale,
  upsertDailyMetrics,
  upsertHourlyMetrics,
  getLiveData,
  getHeatmapData,
};

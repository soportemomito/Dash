const chatwoot = require('./chatwoot');
const supabase = require('./supabase');
const events = require('../events');

async function runSync() {
  try {
    const [inboxMap, conversations] = await Promise.all([
      chatwoot.getInboxMap(),
      chatwoot.getAllOpenPending(),
    ]);

    const snapshots = conversations.map(c => chatwoot.mapConversation(c, inboxMap));
    await supabase.upsertTickets(snapshots);
    await supabase.deleteStale();
    events.emit('synced');

    console.log(`[sync] ${snapshots.length} tickets — ${new Date().toLocaleTimeString('es-CL')}`);
  } catch (err) {
    console.error('[sync] Error:', err.message);
  }
}

async function runHourlySync() {
  try {
    const nowTs = Math.floor(Date.now() / 1000);
    const oneHourAgoTs = nowTs - 3600;
    const today = new Date().toISOString().split('T')[0];

    const [summary, hourSummary] = await Promise.all([
      chatwoot.getDailySummary(),
      chatwoot.getSummaryRange(oneHourAgoTs, nowTs),
    ]);

    const frtSeg = parseFloat(summary?.avg_first_response_time) || null;
    const artSeg = parseFloat(summary?.avg_resolution_time) || null;

    await supabase.upsertDailyMetrics({
      fecha: today,
      frt_promedio_seg: frtSeg ? Math.round(frtSeg) : null,
      art_promedio_seg: artSeg ? Math.round(artSeg) : null,
      tickets_resueltos: summary?.resolutions_count || 0,
      tickets_entrantes: summary?.incoming_messages_count || 0,
    });

    const hourSlot = new Date();
    hourSlot.setMinutes(0, 0, 0);
    await supabase.upsertHourlyMetrics({
      fecha_hora: hourSlot.toISOString(),
      frt_promedio_seg: frtSeg ? Math.round(frtSeg) : null,
      tickets_entrantes: hourSummary?.incoming_messages_count || 0,
      tickets_resueltos: hourSummary?.resolutions_count || 0,
    });

    console.log(`[sync-horario] Métricas horarias actualizadas — ${new Date().toLocaleTimeString('es-CL')}`);
  } catch (err) {
    console.error('[sync-horario] Error:', err.message);
  }
}

module.exports = { runSync, runHourlySync };

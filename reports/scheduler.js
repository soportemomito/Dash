const cron = require('node-cron');
const { generateWeeklyPDF } = require('./generator');
const { sendReport } = require('./mailer');
const { runHourlySync } = require('../sync/sync');

function start() {
  // Sync Chatwoot summary cada hora
  cron.schedule('0 * * * *', async () => {
    await runHourlySync();
  });

  // Informe semanal — lunes 8:00 AM
  cron.schedule('0 8 * * 1', async () => {
    console.log('[scheduler] Generando informe semanal...');
    try {
      const pdfPath = await generateWeeklyPDF();
      await sendReport({
        subject: `SoyMomo CS — Informe semanal ${new Date().toLocaleDateString('es-CL')}`,
        html: `<p>Adjunto el informe semanal de atención al cliente.</p>`,
        attachments: [{ filename: 'informe_semanal.pdf', path: pdfPath }],
      });
      console.log('[scheduler] Informe semanal enviado');
    } catch (err) {
      console.error('[scheduler] Error informe semanal:', err.message);
    }
  });

  console.log('[scheduler] Crons activos (hourly sync + informe semanal lunes 8:00)');
}

module.exports = { start };

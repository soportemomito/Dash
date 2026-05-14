const config = require('./config');
const { runSync } = require('./sync/sync');
const { runSheetsSync } = require('./sync/sheets');
const scheduler = require('./reports/scheduler');
const server = require('./wallboard/server');

function startSelfPing(port) {
  const externalUrl = process.env.RENDER_EXTERNAL_URL;
  const url = externalUrl ? `${externalUrl}/ping` : `http://localhost:${port}/ping`;
  const mod = url.startsWith('https') ? require('https') : require('http');
  setInterval(() => {
    mod.get(url, (res) => {
      console.log(`[ping] ${res.statusCode} ${url}`);
    }).on('error', (err) => {
      console.warn('[ping] error:', err.message);
    });
  }, 14 * 60 * 1000);
  console.log(`[ping] auto-ping activado → ${url}`);
}

async function main() {
  console.log('SoyMomo CS Dash arrancando...');

  server.start(config.app.port);
  startSelfPing(config.app.port);
  scheduler.start();

  await runSync();
  setInterval(runSync, config.app.syncIntervalMs);

  await runSheetsSync();
  setInterval(runSheetsSync, 60 * 1000); // cada 1 minuto
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});

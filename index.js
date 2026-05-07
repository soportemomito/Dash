const config = require('./config');
const { runSync } = require('./sync/sync');
const scheduler = require('./reports/scheduler');
const server = require('./wallboard/server');

async function main() {
  console.log('SoyMomo CS Dash arrancando...');

  server.start(config.app.port);
  scheduler.start();

  await runSync();
  setInterval(runSync, config.app.syncIntervalMs);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});

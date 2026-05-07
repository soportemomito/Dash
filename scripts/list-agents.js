require('dotenv').config();
const axios = require('axios');

async function main() {
  const { data } = await axios.get(
    `${process.env.CHATWOOT_BASE_URL}/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/agents`,
    { headers: { api_access_token: process.env.CHATWOOT_API_TOKEN } }
  );
  console.log('\n=== Agentes en Chatwoot ===\n');
  data.forEach(a => {
    console.log(`  ID: ${String(a.id).padEnd(6)} | ${a.name.padEnd(25)} | ${a.email}`);
  });
  console.log('\nCopia los IDs y completa AGENT_MAP y BOT_AGENT_IDS en .env\n');
}

main().catch(err => console.error('Error:', err.message));

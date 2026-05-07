require('dotenv').config();

module.exports = {
  chatwoot: {
    baseUrl: process.env.CHATWOOT_BASE_URL,
    apiToken: process.env.CHATWOOT_API_TOKEN,
    accountId: process.env.CHATWOOT_ACCOUNT_ID || '1',
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO ? process.env.EMAIL_TO.split(',').map(e => e.trim()) : [],
  },
  agents: {
    nameMap: process.env.AGENT_MAP ? JSON.parse(process.env.AGENT_MAP) : {},
    botIds: process.env.BOT_AGENT_IDS
      ? new Set(process.env.BOT_AGENT_IDS.split(',').map(s => s.trim()))
      : new Set(),
  },
  app: {
    port: parseInt(process.env.PORT, 10) || 3000,
    syncIntervalMs: 60 * 1000,
  },
};

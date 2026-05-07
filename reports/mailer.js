const nodemailer = require('nodemailer');
const config = require('../config');

const transport = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

async function sendReport({ subject, html, attachments = [] }) {
  const info = await transport.sendMail({
    from: config.smtp.from,
    to: config.smtp.to.join(', '),
    subject,
    html,
    attachments,
  });
  console.log(`[mailer] Enviado: ${info.messageId}`);
  return info;
}

async function verifyConnection() {
  await transport.verify();
  console.log('[mailer] SMTP OK');
}

module.exports = { sendReport, verifyConnection };

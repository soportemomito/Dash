const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const supabase = require('../sync/supabase');

function fmt(seg) {
  if (seg == null) return '—';
  return `${Math.round(seg / 60)} min`;
}

function fmtPct(val) {
  if (val == null) return '—';
  return `${parseFloat(val).toFixed(1)}%`;
}

async function getWeeklyData() {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const { data } = await supabase.db
    .from('cs_metricas_diarias')
    .select('*')
    .gte('fecha', since.toISOString().split('T')[0])
    .order('fecha', { ascending: true });
  return data || [];
}

async function generateWeeklyPDF() {
  const rows = await getWeeklyData();
  const outDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outPath = path.join(outDir, `informe_${new Date().toISOString().split('T')[0]}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const periodEnd = new Date().toLocaleDateString('es-CL');
    const periodStart = new Date(Date.now() - 7 * 86400000).toLocaleDateString('es-CL');

    doc
      .fontSize(22).font('Helvetica-Bold')
      .text('SoyMomo CS — Informe Semanal', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(12).font('Helvetica')
      .text(`Período: ${periodStart} → ${periodEnd}`, { align: 'center' });
    doc.moveDown(2);

    const totEntrantes = rows.reduce((s, r) => s + (r.tickets_entrantes || 0), 0);
    const totResueltos = rows.reduce((s, r) => s + (r.tickets_resueltos || 0), 0);
    const avgFrt = rows.filter(r => r.frt_promedio_seg).reduce((s, r, _, a) => s + r.frt_promedio_seg / a.length, 0);
    const avgSla = rows.filter(r => r.pct_sla).reduce((s, r, _, a) => s + parseFloat(r.pct_sla) / a.length, 0);

    doc.fontSize(15).font('Helvetica-Bold').text('Resumen de la semana');
    doc.moveDown(0.5);

    const summary = [
      ['Tickets entrantes', totEntrantes],
      ['Tickets resueltos', totResueltos],
      ['FRT promedio', fmt(avgFrt)],
      ['% SLA cumplido', fmtPct(avgSla)],
    ];

    summary.forEach(([label, value]) => {
      doc.fontSize(12).font('Helvetica-Bold').text(`${label}: `, { continued: true });
      doc.font('Helvetica').text(String(value));
    });

    doc.moveDown(2);
    doc.fontSize(15).font('Helvetica-Bold').text('Detalle por día');
    doc.moveDown(0.5);

    rows.forEach(r => {
      doc.fontSize(11).font('Helvetica-Bold').text(r.fecha, { continued: true });
      doc.font('Helvetica').text(
        `  Entrantes: ${r.tickets_entrantes ?? 0}  |  Resueltos: ${r.tickets_resueltos ?? 0}  |  FRT: ${fmt(r.frt_promedio_seg)}  |  SLA: ${fmtPct(r.pct_sla)}`
      );
    });

    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

module.exports = { generateWeeklyPDF };

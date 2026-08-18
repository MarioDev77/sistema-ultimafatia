const PDFDocument = require('pdfkit');
const { formatBRL } = require('../utils/financeMath');

function buildWeeklyPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Última Fatia — Relatório semanal', { align: 'left' });
    doc.fontSize(11).fillColor('#666').text(`Período: ${report.from} a ${report.to}`);
    doc.moveDown(1);

    doc.fillColor('#000').fontSize(13).text('Resumo financeiro', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11);
    doc.text(`Faturamento confirmado: ${formatBRL(report.revenueCents)} (${report.confirmedCount} pedidos)`);
    doc.text(`Valor pendente de pagamento: ${formatBRL(report.pendingCents)} (${report.pendingCount} pedidos)`);
    doc.text(`Pedidos cancelados: ${report.cancelledCount}`);
    doc.text(`Comprovantes recebidos: ${report.withProofCount}`);
    doc.moveDown(1);

    doc.fontSize(13).text('Pedidos por status', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11);
    if (report.statusCounts.length === 0) {
      doc.text('Nenhum pedido no período.');
    } else {
      report.statusCounts.forEach((s) => doc.text(`${s.status}: ${s.total}`));
    }
    doc.moveDown(1);

    doc.fontSize(13).text('Produção por item', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11);
    if (report.production.length === 0) {
      doc.text('Nenhuma venda no período.');
    } else {
      report.production.forEach((p) =>
        doc.text(`${p.product_name}${p.option_label ? ` (${p.option_label})` : ''}: ${p.total_qty} un — ${formatBRL(p.total_cents)}`)
      );
    }
    doc.moveDown(1);

    doc.fontSize(13).text('Faturamento por dia', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11);
    if (report.byDay.length === 0) {
      doc.text('Sem dados no período.');
    } else {
      report.byDay.forEach((d) =>
        doc.text(`${String(d.pickup_date).slice(0, 10)}: ${d.orders_count} pedido(s) — ${formatBRL(d.revenue_cents)}`)
      );
    }

    if (report.narrative) {
      doc.moveDown(1);
      doc.fontSize(13).text('Balancete da semana', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(11).text(report.narrative, { align: 'justify' });
    }

    doc.end();
  });
}

module.exports = { buildWeeklyPdf };

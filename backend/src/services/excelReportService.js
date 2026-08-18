const ExcelJS = require('exceljs');

function centsToReais(cents) {
  return Math.round(cents) / 100;
}

async function buildWeeklyExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Última Fatia';
  workbook.created = new Date();

  // ---- Aba Resumo ----
  const resumo = workbook.addWorksheet('Resumo');
  resumo.columns = [
    { header: 'Indicador', key: 'label', width: 34 },
    { header: 'Valor', key: 'value', width: 20 },
  ];
  resumo.addRows([
    { label: `Período`, value: `${report.from} a ${report.to}` },
    { label: 'Faturamento confirmado (R$)', value: centsToReais(report.revenueCents) },
    { label: 'Pedidos confirmados', value: report.confirmedCount },
    { label: 'Valor pendente (R$)', value: centsToReais(report.pendingCents) },
    { label: 'Pedidos pendentes', value: report.pendingCount },
    { label: 'Pedidos cancelados', value: report.cancelledCount },
    { label: 'Comprovantes recebidos', value: report.withProofCount },
  ]);
  resumo.getRow(1).font = { bold: true };
  resumo.getColumn('value').numFmt = '#,##0.00';

  // ---- Aba Pedidos por status ----
  const statusSheet = workbook.addWorksheet('Pedidos por status');
  statusSheet.columns = [
    { header: 'Status', key: 'status', width: 26 },
    { header: 'Quantidade', key: 'total', width: 16 },
  ];
  statusSheet.addRows(report.statusCounts.map((s) => ({ status: s.status, total: s.total })));
  statusSheet.getRow(1).font = { bold: true };

  // ---- Aba Produção ----
  const producaoSheet = workbook.addWorksheet('Produção');
  producaoSheet.columns = [
    { header: 'Produto', key: 'product', width: 26 },
    { header: 'Sabor/Opção', key: 'option', width: 24 },
    { header: 'Quantidade', key: 'qty', width: 14 },
    { header: 'Total (R$)', key: 'total', width: 16 },
  ];
  producaoSheet.addRows(
    report.production.map((p) => ({
      product: p.product_name,
      option: p.option_label || '—',
      qty: p.total_qty,
      total: centsToReais(p.total_cents),
    }))
  );
  producaoSheet.getRow(1).font = { bold: true };
  producaoSheet.getColumn('total').numFmt = '#,##0.00';

  // ---- Aba Faturamento por dia ----
  const diaSheet = workbook.addWorksheet('Faturamento por dia');
  diaSheet.columns = [
    { header: 'Data', key: 'date', width: 16 },
    { header: 'Pedidos', key: 'orders', width: 12 },
    { header: 'Faturamento (R$)', key: 'revenue', width: 18 },
  ];
  diaSheet.addRows(
    report.byDay.map((d) => ({
      date: String(d.pickup_date).slice(0, 10),
      orders: d.orders_count,
      revenue: centsToReais(d.revenue_cents),
    }))
  );
  diaSheet.getRow(1).font = { bold: true };
  diaSheet.getColumn('revenue').numFmt = '#,##0.00';

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildWeeklyExcel };

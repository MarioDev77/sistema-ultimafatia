// Relatório financeiro semanal (balancete) do painel admin.
//
// Junta os números reais do banco (faturamento, pedidos por status,
// produção por produto/sabor, comprovantes) dos últimos 7 dias e monta
// o texto do relatório 100% localmente, com código — sem chamar nenhuma
// API externa. O texto é gerado a partir de regras (maior vendido, dia
// mais forte, taxa de cancelamento, pendências, comprovantes faltando),
// sempre calculado em cima dos números reais do sistema.
const db = require('../config/db');
const { formatBRL, formatPct } = require('../utils/financeMath');

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function formatDateBR(dateStr) {
  return String(dateStr).slice(0, 10).split('-').reverse().join('/');
}

// Semana de 7 dias terminando em `endDateStr` (inclusive). Sem
// `endDateStr`, termina hoje.
function resolveWeekRange(endDateStr) {
  const end = endDateStr ? new Date(`${endDateStr}T00:00:00`) : new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { from: isoDate(start), to: isoDate(end) };
}

async function collectWeeklyData(from, to) {
  const [statusCounts] = await db.query(
    `SELECT status, COUNT(*) AS total FROM orders WHERE pickup_date BETWEEN ? AND ? GROUP BY status`,
    [from, to]
  );

  const [revenueRows] = await db.query(
    `SELECT COALESCE(SUM(total_amount_cents), 0) AS revenue_cents, COUNT(*) AS confirmed_count
     FROM orders WHERE pickup_date BETWEEN ? AND ?
       AND status IN ('pagamento_confirmado','em_preparacao','pronto_para_retirada','entregue')`,
    [from, to]
  );

  const [pendingRows] = await db.query(
    `SELECT COALESCE(SUM(total_amount_cents), 0) AS pending_cents, COUNT(*) AS pending_count
     FROM orders WHERE pickup_date BETWEEN ? AND ?
       AND status IN ('aguardando_pagamento','comprovante_enviado')`,
    [from, to]
  );

  const [cancelledRows] = await db.query(
    `SELECT COUNT(*) AS cancelled_count FROM orders WHERE pickup_date BETWEEN ? AND ? AND status = 'cancelado'`,
    [from, to]
  );

  const [production] = await db.query(
    `SELECT pr.name AS product_name, po.label AS option_label,
            COALESCE(SUM(oi.quantity), 0) AS total_qty,
            COALESCE(SUM(oi.subtotal_cents), 0) AS total_cents
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products pr ON pr.id = oi.product_id
     LEFT JOIN product_options po ON po.id = oi.option_id
     WHERE o.pickup_date BETWEEN ? AND ? AND o.status NOT IN ('cancelado', 'pagamento_expirado')
     GROUP BY pr.name, po.label
     ORDER BY total_qty DESC`,
    [from, to]
  );

  const [byDay] = await db.query(
    `SELECT o.pickup_date,
            COALESCE(SUM(CASE WHEN o.status IN ('pagamento_confirmado','em_preparacao','pronto_para_retirada','entregue')
                          THEN o.total_amount_cents ELSE 0 END), 0) AS revenue_cents,
            COUNT(*) AS orders_count
     FROM orders o
     WHERE o.pickup_date BETWEEN ? AND ?
     GROUP BY o.pickup_date
     ORDER BY o.pickup_date`,
    [from, to]
  );

  const [proofRows] = await db.query(
    `SELECT COUNT(*) AS with_proof
     FROM payments p JOIN orders o ON o.id = p.order_id
     WHERE o.pickup_date BETWEEN ? AND ? AND p.proof_type IS NOT NULL`,
    [from, to]
  );

  return {
    statusCounts,
    revenueCents: revenueRows[0].revenue_cents,
    confirmedCount: revenueRows[0].confirmed_count,
    pendingCents: pendingRows[0].pending_cents,
    pendingCount: pendingRows[0].pending_count,
    cancelledCount: cancelledRows[0].cancelled_count,
    production,
    byDay,
    withProofCount: proofRows[0].with_proof,
  };
}

// Monta o texto do balancete só com base nos números já calculados acima
// — nenhuma chamada externa, tudo é lógica local em cima dos dados reais
// do banco.
function buildLocalNarrative(from, to, data) {
  const totalOrders = data.statusCounts.reduce((sum, s) => sum + s.total, 0);

  if (totalOrders === 0) {
    return `Nenhum pedido registrado entre ${formatDateBR(from)} e ${formatDateBR(to)}. Sem movimento para analisar nesta semana.`;
  }

  // ---- Resumo ----
  const paragraphs = [];
  paragraphs.push(
    `Entre ${formatDateBR(from)} e ${formatDateBR(to)} a loja teve ${totalOrders} pedido(s), com faturamento confirmado de ` +
      `${formatBRL(data.revenueCents)} (${data.confirmedCount} pedido(s) pagos). Ainda há ${formatBRL(data.pendingCents)} ` +
      `em ${data.pendingCount} pedido(s) aguardando confirmação de pagamento.`
  );

  // ---- Destaques ----
  const highlights = [];
  if (data.production.length > 0) {
    const topItem = data.production[0];
    const itemLabel = topItem.option_label ? `${topItem.product_name} (${topItem.option_label})` : topItem.product_name;
    highlights.push(`o item mais vendido foi ${itemLabel}, com ${topItem.total_qty} unidade(s) (${formatBRL(topItem.total_cents)})`);
  }
  const daysWithRevenue = data.byDay.filter((d) => d.revenue_cents > 0);
  if (daysWithRevenue.length > 0) {
    const bestDay = daysWithRevenue.reduce((max, d) => (d.revenue_cents > max.revenue_cents ? d : max), daysWithRevenue[0]);
    highlights.push(`o dia de maior faturamento foi ${formatDateBR(bestDay.pickup_date)}, com ${formatBRL(bestDay.revenue_cents)}`);
  }
  if (highlights.length > 0) {
    paragraphs.push(`Destaques da semana: ${highlights.join('; ')}.`);
  }

  // ---- Pontos de atenção ----
  const attention = [];
  if (data.cancelledCount > 0) {
    const cancelRate = data.cancelledCount / totalOrders;
    attention.push(`${data.cancelledCount} pedido(s) cancelado(s) (${formatPct(cancelRate)} do total)`);
  }
  if (data.pendingCount > 0) {
    attention.push(`${data.pendingCount} pedido(s) ainda aguardando confirmação de pagamento (${formatBRL(data.pendingCents)})`);
  }
  const ordersWithProofGap = data.confirmedCount + data.pendingCount - data.withProofCount;
  if (ordersWithProofGap > 0) {
    attention.push(`${ordersWithProofGap} pedido(s) pago(s)/pendente(s) ainda sem comprovante anexado no painel`);
  }
  if (attention.length > 0) {
    paragraphs.push(`Pontos de atenção: ${attention.join('; ')}.`);
  } else {
    paragraphs.push('Nenhum ponto de atenção relevante: sem cancelamentos e sem pendências acumuladas.');
  }

  // ---- Sugestão prática ----
  let suggestion;
  if (data.pendingCount > 0) {
    suggestion = 'Priorize conferir os comprovantes dos pedidos pendentes antes do próximo dia de retirada, para não acumular.';
  } else if (data.cancelledCount / totalOrders > 0.15) {
    suggestion = 'A taxa de cancelamento está alta — vale entender o motivo (ex: prazo curto de pagamento) antes da próxima semana.';
  } else if (data.production.length > 0) {
    const topItem = data.production[0];
    suggestion = `${topItem.product_name} segue como o mais forte — garanta insumo suficiente pra ele na próxima semana.`;
  } else {
    suggestion = 'Semana estável — manter o ritmo atual de produção e divulgação.';
  }
  paragraphs.push(`Sugestão para a próxima semana: ${suggestion}`);

  return paragraphs.join('\n\n');
}

async function buildWeeklyReport(endDateStr) {
  const { from, to } = resolveWeekRange(endDateStr);
  const data = await collectWeeklyData(from, to);
  const narrative = buildLocalNarrative(from, to, data);
  return { from, to, ...data, narrative };
}

module.exports = { buildWeeklyReport, resolveWeekRange, collectWeeklyData };

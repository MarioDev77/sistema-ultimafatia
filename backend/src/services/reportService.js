// Relatório financeiro semanal (balancete) do painel admin.
//
// Junta os números reais do banco (faturamento, pedidos por status,
// produção por produto/sabor, comprovantes) dos últimos 7 dias e usa a
// API da Anthropic só para ESCREVER o texto do relatório em português —
// os números em si são sempre calculados aqui, nunca "inventados" pela
// IA. Se a IA não estiver configurada (sem ANTHROPIC_API_KEY), o
// relatório sai normalmente, só sem o resumo em texto.
const db = require('../config/db');
const env = require('../config/env');
const logger = require('../utils/logger');
const { formatBRL } = require('../utils/financeMath');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function isoDate(d) {
  return d.toISOString().slice(0, 10);
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

function buildNarrativePrompt(from, to, data) {
  const statusLines = data.statusCounts.map((s) => `- ${s.status}: ${s.total}`).join('\n');
  const productionLines = data.production
    .map((p) => `- ${p.product_name}${p.option_label ? ` (${p.option_label})` : ''}: ${p.total_qty} un — ${formatBRL(p.total_cents)}`)
    .join('\n');
  const dayLines = data.byDay.map((d) => `- ${d.pickup_date}: ${d.orders_count} pedido(s), ${formatBRL(d.revenue_cents)}`).join('\n');

  return `Dados reais da loja escolar "Última Fatia" entre ${from} e ${to}:

Faturamento confirmado: ${formatBRL(data.revenueCents)} (${data.confirmedCount} pedidos)
Valor ainda pendente de pagamento: ${formatBRL(data.pendingCents)} (${data.pendingCount} pedidos)
Pedidos cancelados: ${data.cancelledCount}
Comprovantes recebidos no período: ${data.withProofCount}

Pedidos por status:
${statusLines || '- nenhum'}

Produção por item:
${productionLines || '- nenhuma venda no período'}

Faturamento por dia:
${dayLines || '- sem dados'}

Escreva um relatório semanal curto e direto em português, para o responsável da loja
(um aluno/professor gestor, sem formação em contabilidade). Use só os números acima,
não invente nada. Estrutura: 1) resumo de 2-3 frases, 2) destaques (o que vendeu mais,
dia mais forte), 3) pontos de atenção (pendências, cancelamentos, comprovantes faltando),
4) uma sugestão prática para a próxima semana. Nada de tabelas — texto corrido, direto.`;
}

async function generateNarrative(from, to, data) {
  if (!env.assistant.apiKey) return null;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.assistant.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.assistant.model,
        max_tokens: 700,
        messages: [{ role: 'user', content: buildNarrativePrompt(from, to, data) }],
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error('[weeklyReport] Falha ao gerar narrativa com IA', { status: response.status, body: body.slice(0, 300) });
      return null;
    }
    const json = await response.json();
    const textBlock = (json.content || []).find((b) => b.type === 'text');
    return textBlock ? textBlock.text.trim() : null;
  } catch (err) {
    logger.error('[weeklyReport] Erro de rede ao gerar narrativa com IA', { error: err.message });
    return null;
  }
}

async function buildWeeklyReport(endDateStr) {
  const { from, to } = resolveWeekRange(endDateStr);
  const data = await collectWeeklyData(from, to);
  const narrative = await generateNarrative(from, to, data);
  return { from, to, ...data, narrative };
}

module.exports = { buildWeeklyReport, resolveWeekRange, collectWeeklyData };

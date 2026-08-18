// Assistente de matemática financeira do painel admin.
//
// Importante: este assistente é 100% LOCAL. Ele não faz nenhuma chamada
// para uma API externa (nem cobra nada por uso) — ele entende a pergunta
// com correspondência de padrões (regex/palavras-chave) em português e
// calcula a resposta usando os próprios dados do projeto: preços reais
// dos produtos e pedidos/faturamento gravados no banco (backend/src/utils/financeMath.js
// tem as fórmulas puras). Por não ser um modelo de linguagem geral, ele
// não "conversa" sobre qualquer assunto — mas cobre precificação, markup,
// margem, ponto de equilíbrio e consultas de faturamento/pedidos, que é
// o que o painel precisa.
const db = require('../config/db');
const logger = require('../utils/logger');
const {
  formatBRL,
  formatPct,
  contributionMargin,
  marginOnPrice,
  markupOnCost,
  priceFromMarkup,
  breakEvenUnits,
} = require('../utils/financeMath');

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;

class AssistantError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AssistantError('Envie ao menos uma mensagem.', 400);
  }
  if (messages.length > MAX_MESSAGES) {
    throw new AssistantError(`Histórico muito longo (máximo ${MAX_MESSAGES} mensagens). Inicie uma nova conversa.`, 400);
  }
  return messages.map((m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      throw new AssistantError('Formato de mensagem inválido.', 400);
    }
    const content = m.content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (content.length === 0) {
      throw new AssistantError('Mensagem vazia.', 400);
    }
    return { role: m.role, content };
  });
}

// ---------------------------------------------------------------------
// Utilidades de interpretação de texto (sem IA — só normalização/regex)
// ---------------------------------------------------------------------

function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalize(str) {
  return stripAccents(str.toLowerCase());
}

function hasAny(normText, words) {
  return words.some((w) => normText.includes(w));
}

// Encontra valores em reais no texto: aceita "R$ 3,20", "3,20", "200",
// "200 reais", "3.20". Retorna os valores em CENTAVOS, na ordem em que
// aparecem no texto.
function parseMoneyValuesCents(text) {
  // Lookahead negativo para não confundir "50%" (percentual, tratado por
  // parsePercent) com um valor em reais.
  const regex = /r?\$?\s?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\b(?!\s?%|\s?por\s?cento)\s?(?:reais)?/gi;
  const values = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    let token = match[1];
    if (!token) continue;
    if (token.includes(',')) {
      token = token.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(token);
    if (!Number.isNaN(n) && n > 0) {
      values.push(Math.round(n * 100));
    }
  }
  return values;
}

// Encontra uma % no texto (ex.: "50%", "markup de 40 por cento").
function parsePercent(text) {
  const m = /(\d{1,3}(?:,\d{1,2})?)\s*(?:%|por\s?cento)/i.exec(text);
  if (!m) return null;
  return parseFloat(m[1].replace(',', '.')) / 100;
}

async function loadActiveProducts() {
  const [products] = await db.query('SELECT id, slug, name, base_price_cents FROM products WHERE active = 1');
  return products;
}

function findMentionedProduct(normText, products) {
  for (const p of products) {
    const nameTokens = normalize(p.name).split(/\s+/);
    if (nameTokens.some((t) => t.length > 3 && normText.includes(t))) return p;
  }
  if (hasAny(normText, ['cone', 'trufado'])) return products.find((p) => p.slug === 'cone_trufado') || null;
  if (hasAny(normText, ['sanduiche', 'sanduba', 'natural'])) return products.find((p) => p.slug === 'sanduiche_natural') || null;
  return null;
}

function parsePeriodDates(normText) {
  const today = new Date();
  const toISO = (d) => d.toISOString().slice(0, 10);
  if (hasAny(normText, ['hoje'])) {
    const iso = toISO(today);
    return { from: iso, to: iso, label: 'hoje' };
  }
  if (hasAny(normText, ['ontem'])) {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const iso = toISO(y);
    return { from: iso, to: iso, label: 'ontem' };
  }
  if (hasAny(normText, ['semana'])) {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: toISO(from), to: toISO(today), label: 'nos últimos 7 dias' };
  }
  if (hasAny(normText, ['mes', 'mensal'])) {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toISO(from), to: toISO(today), label: 'neste mês' };
  }
  return null;
}

async function getRevenueForRange(from, to) {
  const [revenueRows] = await db.query(
    `SELECT COALESCE(SUM(total_amount_cents), 0) AS revenue_cents, COUNT(*) AS confirmed_orders
     FROM orders WHERE pickup_date BETWEEN ? AND ?
       AND status IN ('pagamento_confirmado','em_preparacao','pronto_para_retirada','entregue')`,
    [from, to]
  );
  const [pendingRows] = await db.query(
    `SELECT COUNT(*) AS pending_orders FROM orders WHERE pickup_date BETWEEN ? AND ? AND status = 'aguardando_pagamento'`,
    [from, to]
  );
  const [topFlavorRows] = await db.query(
    `SELECT pr.name AS product_name, po.label AS option_label, SUM(oi.quantity) AS qty
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products pr ON pr.id = oi.product_id
     LEFT JOIN product_options po ON po.id = oi.option_id
     WHERE o.pickup_date BETWEEN ? AND ? AND o.status NOT IN ('cancelado','pagamento_expirado')
     GROUP BY pr.id, po.id
     ORDER BY qty DESC
     LIMIT 1`,
    [from, to]
  );
  return {
    revenueCents: revenueRows[0].revenue_cents,
    confirmedOrders: revenueRows[0].confirmed_orders,
    pendingOrders: pendingRows[0].pending_orders,
    topFlavor: topFlavorRows[0] || null,
  };
}

// ---------------------------------------------------------------------
// Handlers de cada intenção — cada um devolve a string de resposta
// (ou null se não conseguiu aplicar essa intenção a este texto).
// ---------------------------------------------------------------------

async function handleGreetingOrHelp(normText, products) {
  if (!hasAny(normText, ['oi', 'ola', 'ajuda', 'o que voce faz', 'o que vc faz', 'comandos', 'como funciona'])) {
    return null;
  }
  const menuLines = products.map((p) => `- ${p.name}: ${formatBRL(p.base_price_cents)}`).join('\n');
  return (
    `Sou o assistente de matemática financeira da loja — funciono todo localmente, ` +
    `usando os preços e pedidos já cadastrados no sistema, sem depender de nenhuma API externa.\n\n` +
    `Posso ajudar com:\n` +
    `- Margem e markup: "custo R$ 3,20 e preço R$ 8,00, qual a margem?"\n` +
    `- Preço sugerido: "quanto cobrar no Cone Trufado com markup de 50% e custo R$ 3,20?"\n` +
    `- Ponto de equilíbrio: "quantos sanduíches para cobrir R$ 200 de custo fixo mensal?"\n` +
    `- Faturamento/pedidos: "quanto faturamos hoje?", "quantos pedidos essa semana?"\n` +
    `- Explicações: "o que é margem de contribuição?"\n\n` +
    `Cardápio atual:\n${menuLines}`
  );
}

async function handleBreakEven(normText, rawText, products) {
  if (!hasAny(normText, ['ponto de equilibrio']) && !(hasAny(normText, ['quantos', 'quantas']) && hasAny(normText, ['vender', 'cobrir']))) {
    return null;
  }
  const values = parseMoneyValuesCents(rawText);
  if (values.length === 0) {
    return 'Para calcular o ponto de equilíbrio preciso do valor do custo fixo (ex.: "cobrir R$ 200 de custo fixo mensal"). Pode me passar esse número?';
  }
  const fixedCostCents = values[0];
  const product = findMentionedProduct(normText, products);
  const costGiven = values.length > 1 ? values[1] : null;

  const p = product || products[0];
  const unitPriceCents = p.base_price_cents;
  // Sem custo variável informado, uso o preço de venda inteiro como
  // margem de contribuição aproximada (deixo isso claro na resposta).
  const marginCents = costGiven !== null ? contributionMargin(unitPriceCents, costGiven) : unitPriceCents;
  const units = breakEvenUnits(fixedCostCents, marginCents);

  const period = hasAny(normText, ['mensal', 'mes', 'mês']) ? 'no período' : 'no período informado';
  let out =
    `Ponto de equilíbrio para "${p.name}" (preço de venda ${formatBRL(unitPriceCents)}):\n\n` +
    `Fórmula: unidades = custo fixo ÷ margem de contribuição por unidade\n`;
  if (costGiven !== null) {
    out += `Margem de contribuição = ${formatBRL(unitPriceCents)} − ${formatBRL(costGiven)} = ${formatBRL(marginCents)}\n`;
  } else {
    out += `Não recebi o custo variável (ingrediente/embalagem) por unidade, então usei o preço de venda cheio (${formatBRL(unitPriceCents)}) como aproximação — se você me disser o custo por unidade, o cálculo fica mais preciso.\n`;
  }
  out += `unidades = ${formatBRL(fixedCostCents)} ÷ ${formatBRL(marginCents)} = ${units === null ? 'indefinido (margem zero ou negativa)' : units.toFixed(1).replace('.', ',')} unidades\n\n`;
  if (units !== null) {
    out += `Ou seja, você precisa vender aproximadamente ${Math.ceil(units)} unidades de "${p.name}" ${period} para cobrir esse custo fixo.`;
  }
  return out;
}

async function handleMarkupOrIdealPrice(normText, rawText, products) {
  if (!hasAny(normText, ['markup', 'preco ideal', 'quanto cobrar', 'quanto devo cobrar'])) return null;

  const product = findMentionedProduct(normText, products);
  const values = parseMoneyValuesCents(rawText);
  const pct = parsePercent(rawText);

  if (pct !== null && values.length >= 1) {
    // Tem custo + markup desejado -> sugere preço.
    const costCents = values[0];
    const suggested = priceFromMarkup(costCents, pct);
    return (
      `Preço sugerido com markup de ${formatPct(pct)} sobre o custo de ${formatBRL(costCents)}:\n\n` +
      `Fórmula: preço = custo × (1 + markup)\n` +
      `preço = ${formatBRL(costCents)} × (1 + ${formatPct(pct)}) = ${formatBRL(suggested)}\n\n` +
      `Isso cobre o custo do ingrediente e deixa ${formatBRL(suggested - costCents)} de margem bruta por unidade.`
    );
  }

  if (values.length >= 1 && product) {
    // Tem só o custo -> mostra o markup embutido no preço já cadastrado do produto.
    const costCents = values[0];
    const priceCents = product.base_price_cents;
    const markup = markupOnCost(priceCents, costCents);
    const margin = marginOnPrice(priceCents, costCents);
    return (
      `"${product.name}" está cadastrado no sistema a ${formatBRL(priceCents)}. Com um custo de ${formatBRL(costCents)}:\n\n` +
      `Markup sobre o custo: (preço − custo) ÷ custo = (${formatBRL(priceCents)} − ${formatBRL(costCents)}) ÷ ${formatBRL(costCents)} = ${markup === null ? 'indefinido' : formatPct(markup)}\n` +
      `Margem sobre o preço de venda: (preço − custo) ÷ preço = ${formatPct(margin)}\n` +
      `Lucro bruto por unidade: ${formatBRL(contributionMargin(priceCents, costCents))}`
    );
  }

  return 'Me diga o custo do ingrediente (ex.: "custo R$ 3,20") e, se quiser um preço sugerido, o markup desejado (ex.: "markup de 50%"). Sem isso não tenho como calcular.';
}

async function handleMargin(normText, rawText, products) {
  if (!hasAny(normText, ['margem'])) return null;
  const values = parseMoneyValuesCents(rawText);
  if (values.length >= 2) {
    // Assume o primeiro valor citado é o custo e o segundo o preço, salvo
    // se as palavras "preco"/"venda" aparecerem antes do primeiro valor.
    const [a, b] = values;
    const priceFirst = /pre[cç]o|venda/.test(normText.split(/custo/)[0] || '');
    const costCents = priceFirst ? b : a;
    const priceCents = priceFirst ? a : b;
    const margin = marginOnPrice(priceCents, costCents);
    const markup = markupOnCost(priceCents, costCents);
    return (
      `Custo: ${formatBRL(costCents)} | Preço de venda: ${formatBRL(priceCents)}\n\n` +
      `Margem de contribuição por unidade = preço − custo = ${formatBRL(contributionMargin(priceCents, costCents))}\n` +
      `Margem sobre o preço de venda = (preço − custo) ÷ preço = ${formatPct(margin)}\n` +
      `Markup sobre o custo = (preço − custo) ÷ custo = ${markup === null ? 'indefinido' : formatPct(markup)}`
    );
  }

  // Pedido de explicação do conceito (com exemplo real da loja).
  const p = products[0];
  return (
    `Margem de contribuição é o quanto sobra da venda de uma unidade depois de pagar só o custo ` +
    `variável daquela unidade (ingredientes, embalagem) — antes de descontar custos fixos (aluguel, etc.).\n\n` +
    `Fórmula: margem de contribuição = preço de venda − custo variável por unidade\n\n` +
    `Exemplo com "${p.name}" (preço cadastrado: ${formatBRL(p.base_price_cents)}): se o ingrediente custa, digamos, ` +
    `R$ 3,00 por unidade, a margem de contribuição seria ${formatBRL(p.base_price_cents)} − R$ 3,00 = ${formatBRL(p.base_price_cents - 300)}. ` +
    `Esse valor é o que "sobra" de cada venda para ajudar a cobrir os custos fixos do mês e, depois disso, virar lucro.\n\n` +
    `Me passe um custo real (ex.: "margem com custo R$ 3,20 e preço R$ 8,00") que eu calculo com números exatos.`
  );
}

async function handleRevenueQuery(normText, rawText) {
  if (!hasAny(normText, ['fatura', 'venda', 'vendemos', 'pedido'])) return null;
  const period = parsePeriodDates(normText) || (() => {
    const today = new Date().toISOString().slice(0, 10);
    return { from: today, to: today, label: 'hoje' };
  })();

  const data = await getRevenueForRange(period.from, period.to);
  let out =
    `Faturamento confirmado ${period.label}: ${formatBRL(data.revenueCents)} (${data.confirmedOrders} pedido${data.confirmedOrders === 1 ? '' : 's'} pago${data.confirmedOrders === 1 ? '' : 's'}/confirmado${data.confirmedOrders === 1 ? '' : 's'}).\n` +
    `Pedidos aguardando pagamento no período: ${data.pendingOrders}.`;
  if (data.topFlavor) {
    out += `\nMais vendido no período: ${data.topFlavor.product_name}${data.topFlavor.option_label ? ` (${data.topFlavor.option_label})` : ''}, ${data.topFlavor.qty} unidade${data.topFlavor.qty === 1 ? '' : 's'}.`;
  }
  return out;
}

async function handleExplainConcept(normText, products) {
  if (!hasAny(normText, ['o que e', 'o que sao', 'explique', 'explica', 'defina', 'definicao'])) return null;
  const concepts = {
    'ponto de equilibrio': () =>
      `Ponto de equilíbrio é a quantidade que você precisa vender para que a receita cubra exatamente os custos ` +
      `(fixos + variáveis) — nem lucro, nem prejuízo.\n\n` +
      `Fórmula: unidades = custo fixo do período ÷ margem de contribuição por unidade\n\n` +
      `Me passe o custo fixo e, se tiver, o custo variável por unidade (ex.: "quantos cones vender para cobrir R$ 150, custo R$ 3 por unidade") que calculo com números reais.`,
    markup: () =>
      `Markup é o quanto você soma ao custo para chegar no preço de venda, expresso em % do custo.\n\n` +
      `Fórmula: markup = (preço − custo) ÷ custo\n` +
      `E, ao contrário, para achar o preço a partir de um markup desejado: preço = custo × (1 + markup)\n\n` +
      `Me dê um custo e um markup desejado (ex.: "markup de 40% sobre custo de R$ 3,20") que eu calculo o preço sugerido.`,
    'fluxo de caixa': () =>
      `Fluxo de caixa é o registro de todas as entradas e saídas de dinheiro ao longo do tempo — ` +
      `ajuda a enxergar se sobra caixa suficiente para pagar as contas mesmo quando as vendas variam de um dia para o outro. ` +
      `Aqui na loja, dá para acompanhar as entradas reais perguntando algo como "quanto faturamos essa semana?".`,
  };
  for (const [key, fn] of Object.entries(concepts)) {
    if (normText.includes(key)) return fn();
  }
  return null;
}

async function computeLocalReply(rawText, contextSnapshot) {
  const normText = normalize(rawText);
  const products = await loadActiveProducts();

  const handlers = [
    () => handleGreetingOrHelp(normText, products),
    () => handleExplainConcept(normText, products),
    () => handleBreakEven(normText, rawText, products),
    () => handleMarkupOrIdealPrice(normText, rawText, products),
    () => handleMargin(normText, rawText, products),
    () => handleRevenueQuery(normText, rawText),
  ];

  for (const handler of handlers) {
    // eslint-disable-next-line no-await-in-loop
    const result = await handler();
    if (result) {
      return contextSnapshot ? `${result}\n\n(${contextSnapshot})` : result;
    }
  }

  const menuLines = products.map((p) => `- ${p.name}: ${formatBRL(p.base_price_cents)}`).join('\n');
  return (
    `Não consegui identificar um cálculo financeiro nessa pergunta. Eu funciono por palavras-chave (não sou um ` +
    `modelo de linguagem geral), então funciono melhor com pedidos diretos, por exemplo:\n\n` +
    `- "custo R$ 3,20 preço R$ 8,00, qual a margem?"\n` +
    `- "markup de 50% sobre custo de R$ 3,20"\n` +
    `- "quantos cones vender para cobrir R$ 200 de custo fixo?"\n` +
    `- "quanto faturamos hoje?"\n` +
    `- "o que é ponto de equilíbrio?"\n\n` +
    `Cardápio atual:\n${menuLines}`
  );
}

async function askAssistant(messages, contextSnapshot) {
  const cleanMessages = sanitizeMessages(messages);
  const lastUser = [...cleanMessages].reverse().find((m) => m.role === 'user');
  if (!lastUser) {
    throw new AssistantError('Envie ao menos uma mensagem do usuário.', 400);
  }

  try {
    return await computeLocalReply(lastUser.content, contextSnapshot);
  } catch (err) {
    logger.error('[assistant] Falha ao calcular resposta local', { error: err.message });
    throw new AssistantError('Não consegui calcular essa resposta agora. Tente reformular a pergunta.', 500);
  }
}

module.exports = { askAssistant, AssistantError };

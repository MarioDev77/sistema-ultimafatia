// Matemática financeira pura, sem I/O — usada pelo assistente local do
// painel admin (backend/src/services/assistantService.js). Mantida
// separada para ficar fácil de ler/testar isoladamente dos cálculos.

function formatBRL(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPct(fraction) {
  return `${(fraction * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

// Margem de contribuição = preço de venda - custo variável (por unidade).
function contributionMargin(priceCents, costCents) {
  return priceCents - costCents;
}

// Margem sobre o preço de venda (% do preço que é lucro bruto).
function marginOnPrice(priceCents, costCents) {
  if (priceCents <= 0) return 0;
  return contributionMargin(priceCents, costCents) / priceCents;
}

// Markup sobre o custo (quanto se soma ao custo, em % do custo).
function markupOnCost(priceCents, costCents) {
  if (costCents <= 0) return null;
  return contributionMargin(priceCents, costCents) / costCents;
}

// Dado um custo e um markup desejado (fração, ex 0.5 = 50%), retorna o
// preço de venda sugerido.
function priceFromMarkup(costCents, markupFraction) {
  return Math.round(costCents * (1 + markupFraction));
}

// Ponto de equilíbrio em unidades: custo fixo do período / margem de
// contribuição por unidade. Retorna null se a margem não é positiva
// (não existe ponto de equilíbrio possível nesse caso).
function breakEvenUnits(fixedCostCents, contributionMarginCents) {
  if (contributionMarginCents <= 0) return null;
  return fixedCostCents / contributionMarginCents;
}

// Projeção simples por média móvel: faturamento médio diário (com base
// num período histórico já ocorrido) x número de dias a projetar.
// Não é IA nem regressão — é média simples, deixado claro na resposta
// do assistente para não passar falsa precisão.
function projectRevenue(avgDailyCents, horizonDays) {
  return Math.round(avgDailyCents * horizonDays);
}

module.exports = {
  formatBRL,
  formatPct,
  contributionMargin,
  marginOnPrice,
  markupOnCost,
  priceFromMarkup,
  breakEvenUnits,
  projectRevenue,
};

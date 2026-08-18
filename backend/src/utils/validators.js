// Validação centralizada — listas fechadas, nunca confiar em texto livre do frontend.

const NAME_REGEX = /^[A-Za-zÀ-ÿ' \-]{2,120}$/;

// Turmas disponíveis — lista fechada (mesma usada no seletor do frontend).
// Mantenha esta lista sincronizada com CLASS_OPTIONS em frontend/app/page.js.
const VALID_CLASS_NAMES = new Set([
  '1 Finanças',
  '2 Finanças',
  '1 ADM',
  '2 ADM',
  '3 ADM',
  '1A',
  '1B',
  '1C',
  '1D',
  'Não aluno / Funcionário',
]);

function isValidName(name) {
  return typeof name === 'string' && NAME_REGEX.test(name.trim());
}

function isValidClassName(className) {
  return typeof className === 'string' && VALID_CLASS_NAMES.has(className.trim());
}

function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + 'T00:00:00');
  return !Number.isNaN(d.getTime());
}

function isPositiveInt(n, max = 1000) {
  return Number.isInteger(n) && n > 0 && n <= max;
}

// Valida a lista de itens do pedido antes de qualquer cálculo de preço.
// items: [{ product_id, option_id, quantity }]
function isValidItemsArray(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) return false;
  return items.every(
    (it) =>
      it &&
      isPositiveInt(it.product_id, 100000) &&
      (it.option_id === null || it.option_id === undefined || isPositiveInt(it.option_id, 100000)) &&
      isPositiveInt(it.quantity, 20)
  );
}

module.exports = {
  isValidName,
  isValidClassName,
  isValidDateString,
  isPositiveInt,
  isValidItemsArray,
};

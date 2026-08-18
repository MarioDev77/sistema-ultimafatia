// Validação centralizada — listas fechadas, nunca confiar em texto livre do frontend.

const CLASS_REGEX = /^[A-Za-z0-9ºª° \-]{1,20}$/;
const NAME_REGEX = /^[A-Za-zÀ-ÿ' \-]{2,120}$/;

function isValidName(name) {
  return typeof name === 'string' && NAME_REGEX.test(name.trim());
}

function isValidClassName(className) {
  return typeof className === 'string' && CLASS_REGEX.test(className.trim());
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

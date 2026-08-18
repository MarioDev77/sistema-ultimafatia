const db = require('../config/db');

class PriceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.publicMessage = message;
  }
}

// Recebe os itens BRUTOS do frontend (product_id, option_id, quantity)
// e recalcula TUDO com base no que está no banco. Nunca usa preço
// ou nome de produto vindo da requisição.
async function calculateOrderTotal(items, pickupDate) {
  const [products] = await db.query('SELECT * FROM products WHERE active = 1');
  const productMap = new Map(products.map((p) => [p.id, p]));

  const [options] = await db.query('SELECT * FROM product_options WHERE active = 1');
  const optionMap = new Map(options.map((o) => [o.id, o]));

  const [availabilityRows] = await db.query(
    'SELECT * FROM daily_availability WHERE availability_date = ?',
    [pickupDate]
  );

  const unavailable = new Set(
    availabilityRows.filter((r) => r.available === 0).map((r) => `${r.product_id}:${r.option_id ?? 'null'}`)
  );

  const resolvedItems = [];
  let totalCents = 0;

  for (const raw of items) {
    const product = productMap.get(raw.product_id);
    if (!product) {
      throw new PriceError('Produto inválido ou indisponível.');
    }

    if (unavailable.has(`${product.id}:null`)) {
      throw new PriceError(`"${product.name}" não está disponível na data escolhida.`);
    }

    let option = null;
    if (product.requires_option) {
      if (!raw.option_id) {
        throw new PriceError(`Selecione uma opção para "${product.name}".`);
      }
      option = optionMap.get(raw.option_id);
      if (!option || option.product_id !== product.id) {
        throw new PriceError('Opção inválida para este produto.');
      }
      if (unavailable.has(`${product.id}:${option.id}`)) {
        throw new PriceError(`"${option.label}" não está disponível na data escolhida.`);
      }
    } else if (raw.option_id) {
      throw new PriceError('Este produto não aceita opções.');
    }

    if (product.max_qty_per_order && raw.quantity > product.max_qty_per_order) {
      throw new PriceError(`Quantidade máxima de "${product.name}" excedida.`);
    }

    const unitPrice = product.base_price_cents + (option ? option.extra_price_cents : 0);
    const subtotal = unitPrice * raw.quantity;
    totalCents += subtotal;

    resolvedItems.push({
      product_id: product.id,
      product_name: product.name,
      option_id: option ? option.id : null,
      option_label: option ? option.label : null,
      quantity: raw.quantity,
      unit_price_cents: unitPrice,
      subtotal_cents: subtotal,
    });
  }

  return { items: resolvedItems, totalCents };
}

module.exports = { calculateOrderTotal, PriceError };

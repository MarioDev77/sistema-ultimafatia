const db = require('../config/db');

// Retorna o cardápio já cruzado com a disponibilidade do dia
// escolhido (usado tanto pelo endpoint público quanto pelo admin).
async function getMenuForDate(dateStr) {
  const [products] = await db.query('SELECT * FROM products WHERE active = 1 ORDER BY id');
  const [options] = await db.query('SELECT * FROM product_options WHERE active = 1 ORDER BY product_id, sort_order');
  const [calendarRows] = await db.query('SELECT * FROM store_calendar WHERE calendar_date = ?', [dateStr]);
  const [availabilityRows] = await db.query('SELECT * FROM daily_availability WHERE availability_date = ?', [dateStr]);

  const ordersOpen = calendarRows.length === 0 ? true : Boolean(calendarRows[0].orders_open);

  const unavailableSet = new Set(
    availabilityRows.filter((r) => r.available === 0).map((r) => `${r.product_id}:${r.option_id ?? 'null'}`)
  );

  const menu = products
    .filter((p) => !unavailableSet.has(`${p.id}:null`))
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      price_cents: p.base_price_cents,
      requires_option: Boolean(p.requires_option),
      option_group: p.option_group,
      options: options
        .filter((o) => o.product_id === p.id && !unavailableSet.has(`${p.id}:${o.id}`))
        .map((o) => ({ id: o.id, value: o.option_value, label: o.label, extra_price_cents: o.extra_price_cents })),
    }));

  return { ordersOpen, menu };
}

async function setAvailability(dateStr, productId, optionId, available) {
  await db.query(
    `INSERT INTO daily_availability (availability_date, product_id, option_id, available)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE available = VALUES(available)`,
    [dateStr, productId, optionId, available ? 1 : 0]
  );
}

async function setOrdersOpen(dateStr, ordersOpen, note) {
  await db.query(
    `INSERT INTO store_calendar (calendar_date, orders_open, note)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE orders_open = VALUES(orders_open), note = VALUES(note)`,
    [dateStr, ordersOpen ? 1 : 0, note || null]
  );
}

module.exports = { getMenuForDate, setAvailability, setOrdersOpen };

const crypto = require('crypto');
const db = require('../config/db');

function generatePublicOrderNumber() {
  const n = crypto.randomInt(100000, 999999);
  return `UF-${n}`;
}

function generateAccessToken() {
  // 32 bytes aleatórios -> string base64url (imprevisível, não sequencial)
  return crypto.randomBytes(32).toString('base64url');
}

// Cria pedido + itens dentro de uma transação. Retorna dados públicos
// (nunca o id interno).
async function createOrder({ studentName, className, pickupDate, resolvedItems, totalCents }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let publicOrderNumber;
    let attempts = 0;
    // Garante unicidade do número público (colisão é raríssima, mas trata).
    while (attempts < 5) {
      publicOrderNumber = generatePublicOrderNumber();
      const [existing] = await conn.query('SELECT id FROM orders WHERE public_order_number = ?', [publicOrderNumber]);
      if (existing.length === 0) break;
      attempts++;
    }

    const accessToken = generateAccessToken();

    const [orderResult] = await conn.query(
      `INSERT INTO orders
        (public_order_number, access_token, student_name, class_name, pickup_date, total_amount_cents, status)
       VALUES (?, ?, ?, ?, ?, ?, 'aguardando_pagamento')`,
      [publicOrderNumber, accessToken, studentName, className, pickupDate, totalCents]
    );

    const orderId = orderResult.insertId;

    for (const item of resolvedItems) {
      await conn.query(
        `INSERT INTO order_items
          (order_id, product_id, option_id, quantity, unit_price_cents, subtotal_cents)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.option_id, item.quantity, item.unit_price_cents, item.subtotal_cents]
      );
    }

    await conn.commit();
    return { orderId, publicOrderNumber, accessToken };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function savePayment(orderId, { pixPayload, amountCents, expiresAt }) {
  await db.query(
    `INSERT INTO payments (order_id, pix_payload, amount_cents, status, expires_at)
     VALUES (?, ?, ?, 'pendente', ?)`,
    [orderId, pixPayload, amountCents, expiresAt]
  );
}

// Consulta segura: SÓ retorna o pedido se o token bater. Nunca por ID sequencial.
async function getOrderByToken(token) {
  const [rows] = await db.query(
    `SELECT o.public_order_number, o.student_name, o.class_name, o.pickup_date,
            o.pickup_window_start, o.pickup_window_end, o.total_amount_cents, o.status, o.created_at,
            p.pix_payload, p.status AS payment_status
     FROM orders o
     LEFT JOIN payments p ON p.order_id = o.id
     WHERE o.access_token = ?`,
    [token]
  );
  if (rows.length === 0) return null;

  const [items] = await db.query(
    `SELECT oi.quantity, oi.unit_price_cents, oi.subtotal_cents,
            pr.name AS product_name, po.label AS option_label
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products pr ON pr.id = oi.product_id
     LEFT JOIN product_options po ON po.id = oi.option_id
     WHERE o.access_token = ?`,
    [token]
  );

  return { ...rows[0], items };
}

async function getOrderIdByToken(token) {
  const [rows] = await db.query('SELECT id, total_amount_cents FROM orders WHERE access_token = ?', [token]);
  return rows[0] || null;
}

module.exports = { createOrder, savePayment, getOrderByToken, getOrderIdByToken };

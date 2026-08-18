const express = require('express');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAdmin } = require('../middleware/auth');
const { adminApiLimiter } = require('../middleware/rateLimit');
const { isValidDateString, isPositiveInt } = require('../utils/validators');
const { setAvailability, setOrdersOpen, getMenuForDate } = require('../services/availabilityService');
const { askAssistant, AssistantError } = require('../services/assistantService');
const { assistantLimiter } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

const router = express.Router();

router.use(requireAdmin, adminApiLimiter);

const VALID_STATUSES = [
  'aguardando_pagamento',
  'pagamento_confirmado',
  'em_preparacao',
  'pronto_para_retirada',
  'entregue',
  'cancelado',
  'pagamento_expirado',
];

// ---------- Dashboard ----------
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const dateStr = isValidDateString(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);

    const [statusCounts] = await db.query(
      `SELECT status, COUNT(*) AS total FROM orders WHERE pickup_date = ? GROUP BY status`,
      [dateStr]
    );

    const [revenueRows] = await db.query(
      `SELECT COALESCE(SUM(total_amount_cents), 0) AS revenue_cents
       FROM orders WHERE pickup_date = ? AND status IN ('pagamento_confirmado','em_preparacao','pronto_para_retirada','entregue')`,
      [dateStr]
    );

    const [productionRows] = await db.query(
      `SELECT pr.slug AS product_slug, po.option_value, COALESCE(SUM(oi.quantity),0) AS total_qty
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products pr ON pr.id = oi.product_id
       LEFT JOIN product_options po ON po.id = oi.option_id
       WHERE o.pickup_date = ? AND o.status NOT IN ('cancelado','pagamento_expirado')
       GROUP BY pr.slug, po.option_value`,
      [dateStr]
    );

    res.json({
      date: dateStr,
      status_counts: statusCounts,
      revenue_cents: revenueRows[0].revenue_cents,
      production: productionRows,
    });
  })
);

// ---------- Pedidos ----------
router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const dateStr = isValidDateString(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);
    const [orders] = await db.query(
      `SELECT o.id, o.public_order_number, o.student_name, o.class_name, o.pickup_date, o.status,
              o.total_amount_cents, o.created_at, p.status AS payment_status, p.proof_type
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
       WHERE o.pickup_date = ?
       ORDER BY o.created_at DESC`,
      [dateStr]
    );
    res.json(orders);
  })
);

// Exibe o comprovante enviado pelo cliente: imagem (upload) ou redireciona
// para o link (quando o cliente colou uma URL em vez de enviar arquivo).
router.get(
  '/orders/:id/payment-proof/image',
  asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    if (!isPositiveInt(orderId, Number.MAX_SAFE_INTEGER)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const [rows] = await db.query(
      'SELECT proof_type, proof_image, proof_url FROM payments WHERE order_id = ?',
      [orderId]
    );
    const payment = rows[0];
    if (!payment || !payment.proof_type) {
      return res.status(404).json({ error: 'Nenhum comprovante enviado para este pedido.' });
    }
    if (payment.proof_type === 'link') {
      return res.redirect(payment.proof_url);
    }
    // proof_image é uma data URL: "data:image/png;base64,AAAA..."
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(payment.proof_image || '');
    if (!match) {
      return res.status(500).json({ error: 'Comprovante corrompido.' });
    }
    const [, mimeType, base64Data] = match;
    res.set('Content-Type', mimeType);
    res.send(Buffer.from(base64Data, 'base64'));
  })
);

router.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    if (!isPositiveInt(orderId, Number.MAX_SAFE_INTEGER)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const [orders] = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (orders.length === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const [items] = await db.query(
      `SELECT oi.*, pr.name AS product_name, po.label AS option_label
       FROM order_items oi
       JOIN products pr ON pr.id = oi.product_id
       LEFT JOIN product_options po ON po.id = oi.option_id
       WHERE oi.order_id = ?`,
      [orderId]
    );
    res.json({ ...orders[0], items });
  })
);

router.patch(
  '/orders/:id/status',
  asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    const { status } = req.body || {};
    if (!isPositiveInt(orderId, Number.MAX_SAFE_INTEGER) || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }

    const [result] = await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });

    if (status === 'pagamento_confirmado') {
      await db.query(
        'UPDATE payments SET status = "confirmado", confirmed_by_admin_id = ?, confirmed_at = NOW() WHERE order_id = ?',
        [req.admin.id, orderId]
      );
    }

    await db.query('INSERT INTO security_logs (admin_id, action, details, ip_address) VALUES (?, ?, ?, ?)', [
      req.admin.id,
      'order_status_change',
      `Pedido ${orderId} -> ${status}`,
      req.ip,
    ]);

    res.json({ message: 'Status atualizado.' });
  })
);

// ---------- Financeiro (comprovantes de pagamento) ----------
// Lista os pagamentos de um período com o que é preciso para a aba
// Financeiro: valor, status, se tem comprovante e de que tipo. A
// imagem em si continua servida só pela rota já existente
// /orders/:id/payment-proof/image (não trafega base64 nesta lista).
router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const from = isValidDateString(req.query.from) ? req.query.from : new Date().toISOString().slice(0, 10);
    const to = isValidDateString(req.query.to) ? req.query.to : from;
    const onlyWithProof = req.query.only_with_proof === 'true';

    const conditions = ['o.pickup_date BETWEEN ? AND ?'];
    const params = [from, to];
    if (onlyWithProof) {
      conditions.push('p.proof_type IS NOT NULL');
    }

    const [rows] = await db.query(
      `SELECT o.id AS order_id, o.public_order_number, o.student_name, o.class_name,
              o.pickup_date, o.status AS order_status, o.total_amount_cents,
              p.status AS payment_status, p.proof_type, p.proof_submitted_at, p.confirmed_at
       FROM orders o
       LEFT JOIN payments p ON p.order_id = o.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY o.created_at DESC`,
      params
    );

    const [totalsRows] = await db.query(
      `SELECT COALESCE(SUM(o.total_amount_cents), 0) AS confirmed_cents, COUNT(*) AS confirmed_count
       FROM orders o
       WHERE o.pickup_date BETWEEN ? AND ?
         AND o.status IN ('pagamento_confirmado','em_preparacao','pronto_para_retirada','entregue')`,
      [from, to]
    );

    res.json({
      from,
      to,
      payments: rows,
      confirmed_revenue_cents: totalsRows[0].confirmed_cents,
      confirmed_count: totalsRows[0].confirmed_count,
    });
  })
);

// ---------- Assistente de matemática financeira ----------
router.post(
  '/assistant/chat',
  assistantLimiter,
  asyncHandler(async (req, res) => {
    const { messages, include_today_context } = req.body || {};

    let contextSnapshot = null;
    if (include_today_context) {
      const dateStr = new Date().toISOString().slice(0, 10);
      const [revenueRows] = await db.query(
        `SELECT COALESCE(SUM(total_amount_cents), 0) AS revenue_cents, COUNT(*) AS confirmed_orders
         FROM orders WHERE pickup_date = ? AND status IN ('pagamento_confirmado','em_preparacao','pronto_para_retirada','entregue')`,
        [dateStr]
      );
      const [pendingRows] = await db.query(
        `SELECT COUNT(*) AS pending_orders FROM orders WHERE pickup_date = ? AND status = 'aguardando_pagamento'`,
        [dateStr]
      );
      contextSnapshot = `Data: ${dateStr}. Faturamento confirmado: R$ ${(revenueRows[0].revenue_cents / 100).toFixed(2)} (${revenueRows[0].confirmed_orders} pedidos). Pedidos aguardando pagamento: ${pendingRows[0].pending_orders}.`;
    }

    try {
      const reply = await askAssistant(messages, contextSnapshot);
      res.json({ reply });
    } catch (err) {
      if (err instanceof AssistantError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }
  })
);

// ---------- Disponibilidade diária (produtos/sabores do dia) ----------
router.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const dateStr = isValidDateString(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);
    const data = await getMenuForDate(dateStr);
    res.json(data);
  })
);

router.post(
  '/availability',
  asyncHandler(async (req, res) => {
    const { date, product_id, option_id, available } = req.body || {};
    if (!isValidDateString(date) || !isPositiveInt(product_id, 100000) || typeof available !== 'boolean') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    const optionId = option_id === null || option_id === undefined ? null : Number(option_id);
    if (optionId !== null && !isPositiveInt(optionId, 100000)) {
      return res.status(400).json({ error: 'Opção inválida.' });
    }

    await setAvailability(date, product_id, optionId, available);

    await db.query('INSERT INTO security_logs (admin_id, action, details, ip_address) VALUES (?, ?, ?, ?)', [
      req.admin.id,
      'availability_change',
      `Data ${date}, produto ${product_id}, opção ${optionId}, disponível=${available}`,
      req.ip,
    ]);

    res.json({ message: 'Disponibilidade atualizada.' });
  })
);

router.post(
  '/calendar',
  asyncHandler(async (req, res) => {
    const { date, orders_open, note } = req.body || {};
    if (!isValidDateString(date) || typeof orders_open !== 'boolean') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    await setOrdersOpen(date, orders_open, typeof note === 'string' ? note.slice(0, 255) : null);

    await db.query('INSERT INTO security_logs (admin_id, action, details, ip_address) VALUES (?, ?, ?, ?)', [
      req.admin.id,
      'calendar_change',
      `Data ${date}, pedidos_abertos=${orders_open}`,
      req.ip,
    ]);

    res.json({ message: 'Calendário atualizado.' });
  })
);

// ---------- Produtos e preços ----------
router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const [products] = await db.query('SELECT * FROM products ORDER BY id');
    const [options] = await db.query('SELECT * FROM product_options ORDER BY product_id, sort_order');
    res.json(
      products.map((p) => ({ ...p, options: options.filter((o) => o.product_id === p.id) }))
    );
  })
);

router.patch(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.id);
    const { base_price_cents, active, max_qty_per_order } = req.body || {};
    if (!isPositiveInt(productId, 100000)) return res.status(400).json({ error: 'ID inválido.' });

    const fields = [];
    const values = [];
    if (base_price_cents !== undefined) {
      if (!isPositiveInt(base_price_cents, 100000)) return res.status(400).json({ error: 'Preço inválido.' });
      fields.push('base_price_cents = ?');
      values.push(base_price_cents);
    }
    if (active !== undefined) {
      fields.push('active = ?');
      values.push(active ? 1 : 0);
    }
    if (max_qty_per_order !== undefined) {
      fields.push('max_qty_per_order = ?');
      values.push(max_qty_per_order === null ? null : Number(max_qty_per_order));
    }
    if (fields.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' });

    values.push(productId);
    await db.query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);

    await db.query('INSERT INTO security_logs (admin_id, action, details, ip_address) VALUES (?, ?, ?, ?)', [
      req.admin.id,
      'price_change',
      `Produto ${productId} atualizado: ${fields.join(', ')}`,
      req.ip,
    ]);

    res.json({ message: 'Produto atualizado.' });
  })
);

router.patch(
  '/product-options/:id',
  asyncHandler(async (req, res) => {
    const optionId = Number(req.params.id);
    const { active } = req.body || {};
    if (!isPositiveInt(optionId, 100000) || typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    await db.query('UPDATE product_options SET active = ? WHERE id = ?', [active ? 1 : 0, optionId]);
    res.json({ message: 'Opção atualizada.' });
  })
);

// ---------- Logs de segurança ----------
router.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const [logs] = await db.query(
      `SELECT sl.id, sl.action, sl.details, sl.ip_address, sl.created_at, au.username
       FROM security_logs sl
       LEFT JOIN admin_users au ON au.id = sl.admin_id
       ORDER BY sl.created_at DESC
       LIMIT 200`
    );
    res.json(logs);
  })
);

module.exports = router;

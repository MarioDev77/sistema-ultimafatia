const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { isValidName, isValidClassName, isValidDateString, isValidItemsArray } = require('../utils/validators');
const { calculateOrderTotal, PriceError } = require('../services/priceService');
const { createOrder, savePayment, getOrderByToken } = require('../services/orderService');
const { buildPixPayload, buildPixQrCodeDataUrl } = require('../services/pixService');
const { getMenuForDate } = require('../services/availabilityService');
const { orderCreationLimiter, orderLookupLimiter } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/orders — cria o pedido. O CLIENTE NUNCA envia preço.
router.post(
  '/',
  orderCreationLimiter,
  asyncHandler(async (req, res) => {
    const { student_name, class_name, pickup_date, items } = req.body || {};

    if (!isValidName(student_name)) {
      return res.status(400).json({ error: 'Nome inválido.' });
    }
    if (!isValidClassName(class_name)) {
      return res.status(400).json({ error: 'Turma inválida.' });
    }
    if (!isValidDateString(pickup_date)) {
      return res.status(400).json({ error: 'Data de retirada inválida.' });
    }
    if (!isValidItemsArray(items)) {
      return res.status(400).json({ error: 'Itens do pedido inválidos.' });
    }

    // Confere se a loja está aberta para pedidos naquele dia.
    const { ordersOpen } = await getMenuForDate(pickup_date);
    if (!ordersOpen) {
      return res.status(400).json({ error: 'Não há pedidos abertos para esta data.' });
    }

    let calculation;
    try {
      calculation = await calculateOrderTotal(items, pickup_date);
    } catch (err) {
      if (err instanceof PriceError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    }

    const { orderId, publicOrderNumber, accessToken } = await createOrder({
      studentName: student_name.trim(),
      className: class_name.trim(),
      pickupDate: pickup_date,
      resolvedItems: calculation.items,
      totalCents: calculation.totalCents,
    });

    const pixPayload = buildPixPayload(calculation.totalCents, publicOrderNumber);
    const qrCodeDataUrl = await buildPixQrCodeDataUrl(pixPayload);

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min para pagar
    await savePayment(orderId, { pixPayload, amountCents: calculation.totalCents, expiresAt });

    logger.info('Pedido criado', { publicOrderNumber, totalCents: calculation.totalCents });

    res.status(201).json({
      order_number: publicOrderNumber,
      access_token: accessToken,
      total_amount_cents: calculation.totalCents,
      items: calculation.items,
      pickup_date,
      pickup_window: '09:40 às 10:00',
      pix: {
        payload: pixPayload,
        qr_code_data_url: qrCodeDataUrl,
        expires_at: expiresAt.toISOString(),
      },
    });
  })
);

// GET /api/orders/:token — consulta pública, mas só com o token secreto do pedido (anti-IDOR).
router.get(
  '/:token',
  orderLookupLimiter,
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    if (typeof token !== 'string' || token.length < 20 || token.length > 60) {
      return res.status(400).json({ error: 'Token inválido.' });
    }
    const order = await getOrderByToken(token);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    res.json(order);
  })
);

// POST /api/orders/:token/notify-payment — aluno avisa que pagou.
// Isso NUNCA muda o status do pedido sozinho; só sinaliza para o
// admin conferir manualmente (já que não há PSP com webhook).
router.post(
  '/:token/notify-payment',
  orderLookupLimiter,
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const order = await getOrderByToken(token);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }
    logger.info('Aluno sinalizou pagamento realizado', { orderNumber: order.public_order_number });
    res.json({ message: 'Obrigado! Vamos conferir seu pagamento em instantes.' });
  })
);

// O envio de comprovante pelo cliente foi removido (aluno paga só pelo
// QR Code / copia-e-cola). O comprovante agora é fotografado pelo admin,
// direto no balcão — ver POST /api/admin/orders/:id/payment-proof/capture
// em routes/admin.js. getOrderIdByToken continua exportado/usado só
// internamente pelo orderService quando necessário.

module.exports = router;

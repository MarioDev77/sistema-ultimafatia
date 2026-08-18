const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { isValidName, isValidClassName, isValidDateString, isValidItemsArray } = require('../utils/validators');
const { calculateOrderTotal, PriceError } = require('../services/priceService');
const { createOrder, savePayment, savePaymentProof, getOrderByToken, getOrderIdByToken } = require('../services/orderService');
const { buildPixPayload, buildPixQrCodeDataUrl } = require('../services/pixService');
const { getMenuForDate } = require('../services/availabilityService');
const { orderCreationLimiter, orderLookupLimiter } = require('../middleware/rateLimit');
const { uploadProofSingle } = require('../middleware/upload');
const logger = require('../utils/logger');

const MAX_PROOF_URL_LENGTH = 500;

function isValidHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PROOF_URL_LENGTH) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

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

// POST /api/orders/:token/payment-proof — cliente envia comprovante
// (upload de imagem OU link) e o pagamento é confirmado automaticamente.
router.post(
  '/:token/payment-proof',
  orderLookupLimiter,
  uploadProofSingle, // no-op (não seta req.file) se a requisição não for multipart/form-data
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    if (typeof token !== 'string' || token.length < 20 || token.length > 60) {
      return res.status(400).json({ error: 'Token inválido.' });
    }

    const order = await getOrderIdByToken(token);
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const file = req.file; // presente quando o envio foi upload de arquivo
    const proofUrl = req.body && typeof req.body.proof_url === 'string' ? req.body.proof_url.trim() : '';

    if (file) {
      const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      await savePaymentProof(order.id, { type: 'upload', image: dataUrl });
    } else if (proofUrl) {
      if (!isValidHttpUrl(proofUrl)) {
        return res.status(400).json({ error: 'Link do comprovante inválido.' });
      }
      await savePaymentProof(order.id, { type: 'link', url: proofUrl });
    } else {
      return res.status(400).json({ error: 'Envie uma imagem do comprovante ou cole o link.' });
    }

    logger.info('Comprovante de pagamento recebido', { orderNumber: token.slice(0, 8) });
    res.json({ message: 'Comprovante recebido! Seu pagamento foi confirmado.' });
  })
);

module.exports = router;

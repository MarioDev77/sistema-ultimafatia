const QRCode = require('qrcode');
const env = require('../config/env');

// ============================================================
// Gerador de payload Pix (BR Code / EMV QR Code) — 100% no
// backend. A chave Pix (env.pix.key) NUNCA sai desta função,
// nunca é logada e nunca é devolvida em nenhuma resposta de API.
// Baseado no manual "Payload do Pix" do Banco Central (EMV Merchant
// Presented QR Code).
// ============================================================

function tlv(id, value) {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

// Remove acentos/caracteres não suportados pelo padrão EMV (apenas
// texto simples ASCII é aceito nos campos de nome/cidade/txid).
function sanitizeAscii(str, maxLen) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, maxLen);
}

function crc16(payload) {
  let crc = 0xffff;
  const polynomial = 0x1021;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Gera o payload Pix "copia e cola" para um pedido específico.
 * @param {number} amountCents - valor total já calculado no backend, em centavos.
 * @param {string} txid - identificador da transação (usamos o número público do pedido).
 */
function buildPixPayload(amountCents, txid) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('Valor inválido para geração do Pix.');
  }

  const amount = (amountCents / 100).toFixed(2);
  const cleanTxid = sanitizeAscii(txid, 25) || '***';
  const merchantName = sanitizeAscii(env.pix.merchantName, 25) || 'ULTIMA FATIA';
  const merchantCity = sanitizeAscii(env.pix.merchantCity, 15) || 'BRASIL';

  const merchantAccountInfo =
    tlv('00', 'br.gov.bcb.pix') + tlv('01', env.pix.key);

  const additionalData = tlv('05', cleanTxid);

  let payload =
    tlv('00', '01') + // Payload Format Indicator
    tlv('26', merchantAccountInfo) + // Merchant Account Info - Pix
    tlv('52', '0000') + // Merchant Category Code
    tlv('53', '986') + // Moeda: BRL
    tlv('54', amount) + // Valor da transação
    tlv('58', 'BR') + // País
    tlv('59', merchantName) + // Nome do recebedor
    tlv('60', merchantCity) + // Cidade do recebedor
    tlv('62', additionalData); // Dados adicionais (txid)

  payload += '6304'; // ID + tamanho do CRC, sem o valor ainda
  const checksum = crc16(payload);

  return payload + checksum;
}

async function buildPixQrCodeDataUrl(payload) {
  // Gerado como imagem PNG em base64 — nada disso passa pelo Pix,
  // é só a representação visual do payload.
  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
}

module.exports = { buildPixPayload, buildPixQrCodeDataUrl };

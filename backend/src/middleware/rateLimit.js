const rateLimit = require('express-rate-limit');

// Progressão simples: limites diferentes por sensibilidade da rota.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente mais tarde.' },
});

const orderCreationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitos pedidos criados em pouco tempo. Aguarde alguns minutos.' },
});

const orderLookupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas consultas. Aguarde um momento.' },
});

const adminApiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  loginLimiter,
  orderCreationLimiter,
  orderLookupLimiter,
  adminApiLimiter,
  generalLimiter,
};

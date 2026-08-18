const logger = require('../utils/logger');
const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error('Erro não tratado', {
    message: err.message,
    stack: env.nodeEnv === 'production' ? undefined : err.stack,
    path: req.path,
    method: req.method,
  });

  const status = err.status || 500;

  // Em produção nunca vaza stack trace, estrutura do banco ou stack tecnológica.
  const publicMessage =
    env.nodeEnv === 'production'
      ? status < 500
        ? err.publicMessage || 'Requisição inválida.'
        : 'Ocorreu um erro interno. Tente novamente em instantes.'
      : err.message;

  res.status(status).json({ error: publicMessage });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Recurso não encontrado.' });
}

module.exports = { errorHandler, notFoundHandler };

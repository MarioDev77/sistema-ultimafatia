// Logger simples com redaction — NUNCA loga senha, chave Pix,
// token de sessão ou token de acesso do pedido.
const REDACT_KEYS = ['password', 'password_hash', 'pix_key', 'pixKey', 'token', 'access_token', 'jwt', 'authorization'];

function redact(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(clone)) {
    if (REDACT_KEYS.some((k) => key.toLowerCase().includes(k))) {
      clone[key] = '[REDACTED]';
    } else if (typeof clone[key] === 'object') {
      clone[key] = redact(clone[key]);
    }
  }
  return clone;
}

function log(level, message, meta = {}) {
  const entry = {
    level,
    message,
    ...redact(meta),
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else console.log(line);
}

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};

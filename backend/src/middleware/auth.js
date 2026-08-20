const jwt = require('jsonwebtoken');
const env = require('../config/env');

const COOKIE_NAME = 'uf_admin_session';

function issueSessionCookie(res, payload) {
  const token = jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    // O frontend faz proxy same-origin das chamadas de API (ver
    // next.config.js) — o navegador nunca fala direto com o domínio do
    // backend. Por isso o cookie pode (e deve) ser 'lax': é mais seguro
    // que 'none' e evita o bloqueio de cookie "cross-site" que alguns
    // navegadores mobile aplicam por padrão.
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8h
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

// Exige admin autenticado. Nunca confia em header customizado nem em ID na URL.
function requireAdmin(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  try {
    const decoded = jwt.verify(token, env.jwt.secret);
    req.admin = { id: decoded.sub, username: decoded.username };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

module.exports = { requireAdmin, issueSessionCookie, clearSessionCookie, COOKIE_NAME };

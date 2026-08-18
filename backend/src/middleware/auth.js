const jwt = require('jsonwebtoken');
const env = require('../config/env');

const COOKIE_NAME = 'uf_admin_session';

function issueSessionCookie(res, payload) {
  const token = jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    // 'none' é necessário porque o frontend (Vercel) e o backend (Railway)
    // estão em domínios diferentes. Requer secure:true (HTTPS), o que já
    // é o caso em produção. Em dev (http://localhost) cai para 'lax'.
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8h
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
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

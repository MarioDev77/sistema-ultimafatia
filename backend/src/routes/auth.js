const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { issueSessionCookie, clearSessionCookie, requireAdmin } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const logger = require('../utils/logger');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    const [rows] = await db.query('SELECT * FROM admin_users WHERE username = ? AND is_active = 1', [username]);
    const admin = rows[0];

    // Resposta genérica sempre, para não vazar se o usuário existe.
    const genericError = () => res.status(401).json({ error: 'Usuário ou senha inválidos.' });

    if (!admin) {
      logger.warn('Tentativa de login com usuário inexistente', { ip: req.ip });
      return genericError();
    }

    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      return res.status(423).json({ error: 'Conta temporariamente bloqueada. Tente novamente mais tarde.' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);

    if (!valid) {
      const attempts = admin.failed_login_attempts + 1;
      const lockedUntil = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;
      await db.query('UPDATE admin_users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?', [
        attempts,
        lockedUntil,
        admin.id,
      ]);
      logger.warn('Login administrativo falhou', { adminId: admin.id, ip: req.ip });
      return genericError();
    }

    await db.query(
      'UPDATE admin_users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?',
      [admin.id]
    );

    issueSessionCookie(res, { sub: admin.id, username: admin.username });

    await db.query('INSERT INTO security_logs (admin_id, action, details, ip_address) VALUES (?, ?, ?, ?)', [
      admin.id,
      'login',
      'Login administrativo bem-sucedido',
      req.ip,
    ]);

    res.json({ username: admin.username });
  })
);

router.post(
  '/logout',
  requireAdmin,
  asyncHandler(async (req, res) => {
    clearSessionCookie(res);
    await db.query('INSERT INTO security_logs (admin_id, action, ip_address) VALUES (?, ?, ?)', [
      req.admin.id,
      'logout',
      req.ip,
    ]);
    res.json({ message: 'Sessão encerrada.' });
  })
);

router.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ username: req.admin.username });
  })
);

module.exports = router;

// Uso: node src/scripts/createAdmin.js <username> <senha>
// Cria (ou atualiza a senha de) um usuário administrador.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function main() {
  const [, , username, password] = process.argv;
  if (!username || !password) {
    console.error('Uso: node src/scripts/createAdmin.js <username> <senha>');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('A senha deve ter pelo menos 10 caracteres.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  const [existing] = await db.query('SELECT id FROM admin_users WHERE username = ?', [username]);
  if (existing.length > 0) {
    await db.query('UPDATE admin_users SET password_hash = ?, is_active = 1, failed_login_attempts = 0, locked_until = NULL WHERE username = ?', [hash, username]);
    console.log(`Senha do admin "${username}" atualizada.`);
  } else {
    await db.query('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [username, hash]);
    console.log(`Admin "${username}" criado.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro ao criar admin:', err.message);
  process.exit(1);
});

const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '-03:00',
  decimalNumbers: true,
  // Sem isso, o driver pode negociar um charset sem suporte completo a
  // acentos/emoji dependendo do servidor MySQL, causando perda silenciosa
  // de caracteres como "á", "í", "ã" (ex.: "Maracujá" virando "Maracuj").
  charset: 'utf8mb4',
});

module.exports = pool;

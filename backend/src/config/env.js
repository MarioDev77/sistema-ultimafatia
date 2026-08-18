require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

module.exports = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  db: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },

  // A chave Pix só é lida aqui, no servidor. Nunca é exportada
  // para nenhuma rota pública nem para o frontend.
  pix: {
    key: required('PIX_KEY'),
    merchantName: (process.env.PIX_MERCHANT_NAME || 'ULTIMA FATIA').slice(0, 25),
    merchantCity: (process.env.PIX_MERCHANT_CITY || 'SAO PAULO').slice(0, 15),
  },

  // Assistente de matemática financeira do painel admin. Opcional: se a
  // chave não estiver configurada, a rota do assistente responde 503 em
  // vez de derrubar o servidor inteiro (diferente de PIX_KEY/JWT_SECRET,
  // essa feature não é essencial para o funcionamento da loja).
  assistant: {
    apiKey: process.env.ANTHROPIC_API_KEY || null,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
  },
};

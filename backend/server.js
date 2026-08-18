const express = require('express');
const cookieParser = require('cookie-parser');
const env = require('./src/config/env');
const { cors, helmet } = require('./src/middleware/security');
const { generalLimiter } = require('./src/middleware/rateLimit');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const logger = require('./src/utils/logger');

const { runMigration } = require('./src/scripts/migrate');

const menuRoutes = require('./src/routes/menu');
const orderRoutes = require('./src/routes/orders');
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');

const app = express();

app.set('trust proxy', 1); // necessário no Railway para IP real (rate limit correto)

app.use(helmet);
app.use(cors);
app.use(express.json({ limit: '100kb' })); // corpo pequeno, pedido não precisa de mais
app.use(cookieParser());
app.use(generalLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/auth', authRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// Roda a migração (idempotente) toda vez que o servidor sobe, para que
// correções já escritas no código (acentos, bug de disponibilidade, etc.)
// nunca fiquem "presas" só porque ninguém rodou `npm run migrate` manualmente
// no banco de produção. Se falhar (ex.: usuário do banco sem permissão de
// ALTER), o servidor sobe mesmo assim e só registra o erro no log — uma
// falha de migração não deve deixar a loja inteira fora do ar.
runMigration()
  .catch((err) => {
    logger.error('[startup] Migração automática falhou — servidor vai subir mesmo assim', {
      error: err.message,
    });
  })
  .finally(() => {
    app.listen(env.port, () => {
      logger.info(`Servidor Última Fatia rodando na porta ${env.port}`, { env: env.nodeEnv });
    });
  });

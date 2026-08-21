// Uso: npm run migrate  (ou: node src/scripts/migrate.js)
//
// Migração idempotente — pode ser rodada quantas vezes for preciso, com
// segurança, sem apagar pedidos, pagamentos ou histórico existente.
//
// O que ela corrige:
//  1) Converte as tabelas para utf8mb4, recuperando o texto acentuado
//     ("Maracujá", "Prestígio", "irresistíveis"...) que ficava sem os
//     acentos por causa do charset da conexão/tabelas em produção.
//  2) Re-aplica os textos corretos do cardápio (produto/sabor), caso já
//     tenham sido gravados sem acento no banco.
//  3) Corrige a estrutura de `daily_availability` para eliminar o bug em
//     que um produto marcado como indisponível não conseguia mais voltar
//     a ficar disponível (duplicidade causada por NULL em UNIQUE KEY).
require('dotenv').config();
const db = require('../config/db');
const logger = require('../utils/logger');

const TABLES_WITH_TEXT = [
  'admin_users',
  'products',
  'product_options',
  'daily_availability',
  'store_calendar',
  'orders',
  'order_items',
  'payments',
  'settings',
  'security_logs',
];

const CORRECT_PRODUCTS = [
  { slug: 'sanduiche_natural', name: 'Sanduíche Natural', description: 'Feito com ingredientes frescos, leve, saboroso e perfeito para o dia a dia.' },
  { slug: 'cone_trufado', name: 'Cone Trufado', description: 'Casquinha crocante com recheio trufado e diversos sabores irresistíveis.' },
];

const CORRECT_OPTIONS = [
  { option_value: 'com_ervilha', label: 'Com ervilha' },
  { option_value: 'sem_ervilha', label: 'Sem ervilha' },
  { option_value: 'maracuja', label: 'Maracujá' },
  { option_value: 'ninho', label: 'Ninho' },
  { option_value: 'brigadeiro', label: 'Brigadeiro' },
  { option_value: 'brigadeiro_morango', label: 'Brigadeiro com morango' },
  { option_value: 'brigadeiro_prestigio', label: 'Brigadeiro e Prestígio' },
];

async function step1_fixCharset() {
  for (const table of TABLES_WITH_TEXT) {
    await db.query(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    logger.info(`[migrate] Tabela ${table} convertida para utf8mb4`);
  }
}

async function step2_fixMenuText() {
  for (const p of CORRECT_PRODUCTS) {
    await db.query('UPDATE products SET name = ?, description = ? WHERE slug = ?', [p.name, p.description, p.slug]);
  }
  for (const o of CORRECT_OPTIONS) {
    await db.query('UPDATE product_options SET label = ? WHERE option_value = ?', [o.label, o.option_value]);
  }
  logger.info('[migrate] Textos do cardápio (nomes/sabores) corrigidos');
}

async function step3_fixAvailabilityTable() {
  // 3a) Remove duplicidades herdadas do bug antigo: para cada
  // (data, produto, opção-ou-produto-inteiro) mantém só a linha mais
  // recente (maior id = ação mais recente do admin), que é o estado
  // que deve prevalecer.
  await db.query(`
    DELETE d1 FROM daily_availability d1
    JOIN daily_availability d2
      ON d1.availability_date = d2.availability_date
     AND d1.product_id = d2.product_id
     AND COALESCE(d1.option_id, 0) = COALESCE(d2.option_id, 0)
     AND d1.id < d2.id
  `);
  logger.info('[migrate] Duplicidades antigas em daily_availability removidas');

  // 3b) Adiciona a coluna gerada + troca a UNIQUE KEY, só se ainda não
  // tiver sido aplicado (torna o script seguro para rodar de novo).
  const [cols] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'daily_availability' AND column_name = 'option_id_key'`
  );
  if (cols[0].n === 0) {
    await db.query(`
      ALTER TABLE daily_availability
        ADD COLUMN option_id_key INT UNSIGNED GENERATED ALWAYS AS (COALESCE(option_id, 0)) STORED AFTER option_id
    `);
    logger.info('[migrate] Coluna option_id_key adicionada');
  }

  const [idx] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'daily_availability'
       AND index_name = 'uq_avail' AND column_name = 'option_id'`
  );
  if (idx[0].n > 0) {
    await db.query('ALTER TABLE daily_availability DROP INDEX uq_avail');
    await db.query('ALTER TABLE daily_availability ADD UNIQUE KEY uq_avail (availability_date, product_id, option_id_key)');
    logger.info('[migrate] UNIQUE KEY uq_avail recriada usando option_id_key');
  }
}

async function step4_addProofReviewStatus() {
  // Idempotente: MODIFY COLUMN pode ser rodado de novo sem problema.
  await db.query(`
    ALTER TABLE orders MODIFY COLUMN status ENUM(
      'aguardando_pagamento',
      'comprovante_enviado',
      'pagamento_confirmado',
      'em_preparacao',
      'pronto_para_retirada',
      'entregue',
      'cancelado',
      'pagamento_expirado'
    ) NOT NULL DEFAULT 'aguardando_pagamento'
  `);
  logger.info('[migrate] Status "comprovante_enviado" adicionado (revisão manual do comprovante pelo admin)');
}

async function step5_removeErvilhaOption() {
  // O sanduíche natural tinha opção "com ervilha" / "sem ervilha" que não
  // mudava preço nem produção — só confundia o aluno no pedido. A partir
  // de agora o sanduíche não exige mais escolha de opção: o aluno só
  // seleciona o produto. As opções antigas ficam desativadas (não
  // deletadas, para não quebrar o histórico de pedidos já feitos com
  // elas em order_items).
  const [result] = await db.query(
    `UPDATE products SET requires_option = 0, option_group = NULL WHERE slug = 'sanduiche_natural'`
  );
  if (result.affectedRows > 0) {
    logger.info('[migrate] Sanduíche natural não exige mais opção (ervilha removida)');
  }
  await db.query(
    `UPDATE product_options po
     JOIN products pr ON pr.id = po.product_id
     SET po.active = 0
     WHERE pr.slug = 'sanduiche_natural' AND po.option_value IN ('com_ervilha', 'sem_ervilha')`
  );
}

async function step6_addSecurityLogsCreatedAtIndex() {
  // GET /api/admin/logs faz ORDER BY sl.created_at DESC LIMIT 200 sem
  // índice em created_at — full scan + filesort à medida que a tabela
  // cresce. Idempotente: só cria o índice se ele ainda não existir.
  const [idx] = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'security_logs'
       AND index_name = 'idx_created_at'`
  );
  if (idx[0].n === 0) {
    await db.query('ALTER TABLE security_logs ADD INDEX idx_created_at (created_at)');
    logger.info('[migrate] Índice idx_created_at adicionado em security_logs');
  }
}

// Cada passo roda isolado: se um passo falhar (ex.: permissão de ALTER
// TABLE negada pelo plano do banco), os outros passos continuam rodando
// mesmo assim. Antes, um erro no passo 1 travava a migração inteira e os
// passos seguintes — incluindo a correção do bug de disponibilidade —
// nunca chegavam a rodar.
async function runStep(name, fn) {
  try {
    await fn();
  } catch (err) {
    logger.error(`[migrate] Passo "${name}" falhou — seguindo para o próximo passo mesmo assim`, {
      error: err.message,
    });
  }
}

async function runMigration() {
  await runStep('fixCharset', step1_fixCharset);
  await runStep('fixMenuText', step2_fixMenuText);
  await runStep('fixAvailabilityTable', step3_fixAvailabilityTable);
  await runStep('addProofReviewStatus', step4_addProofReviewStatus);
  await runStep('removeErvilhaOption', step5_removeErvilhaOption);
  await runStep('addSecurityLogsCreatedAtIndex', step6_addSecurityLogsCreatedAtIndex);
  logger.info('[migrate] Migração concluída (ver acima se algum passo falhou).');
}

// Só executa como processo próprio (`npm run migrate`) — quando importado
// pelo server.js na subida, quem chama é o server.js, e ele decide o que
// fazer com o erro (não damos process.exit aqui para não derrubar o server).
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('[migrate] Falhou', { error: err.message });
      process.exit(1);
    });
}

module.exports = { runMigration };

-- ============================================================
-- ÚLTIMA FATIA — Schema MySQL
-- Etapa 1: modelagem do banco de dados
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '-03:00';

-- ------------------------------------------------------------
-- 1. Administradores
-- ------------------------------------------------------------
CREATE TABLE admin_users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,     -- Argon2id ou bcrypt
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. Produtos (Sanduíche Natural / Cone Trufado)
--    Preço fica SEMPRE aqui — nunca confiar no frontend.
-- ------------------------------------------------------------
CREATE TABLE products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(30) NOT NULL UNIQUE,        -- 'sanduiche_natural' | 'cone_trufado'
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  base_price_cents INT UNSIGNED NOT NULL,  -- preço em centavos (700 = R$7,00)
  requires_option TINYINT(1) NOT NULL DEFAULT 0, -- ex: cone exige sabor
  option_group VARCHAR(30) NULL,           -- 'ervilha' | 'sabor_cone'
  active TINYINT(1) NOT NULL DEFAULT 1,    -- liga/desliga produto globalmente
  max_qty_per_order SMALLINT UNSIGNED NULL, -- limite opcional
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. Opções de produto (com/sem ervilha, sabores de cone)
--    Lista fechada — nunca aceitar valor livre do frontend.
-- ------------------------------------------------------------
CREATE TABLE product_options (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  option_value VARCHAR(50) NOT NULL,       -- 'com_ervilha','sem_ervilha','maracuja',...
  label VARCHAR(80) NOT NULL,              -- texto exibido ao aluno
  extra_price_cents INT NOT NULL DEFAULT 0,-- caso algum sabor custe diferente no futuro
  active TINYINT(1) NOT NULL DEFAULT 1,    -- liga/desliga opção globalmente
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_option_product FOREIGN KEY (product_id) REFERENCES products(id),
  UNIQUE KEY uq_product_option (product_id, option_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. Disponibilidade diária (o admin marca o que está
--    disponível NAQUELE dia, sem mexer no cadastro fixo)
-- ------------------------------------------------------------
CREATE TABLE daily_availability (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  availability_date DATE NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  option_id INT UNSIGNED NULL,             -- NULL = refere-se ao produto inteiro
  -- Coluna gerada só para a UNIQUE KEY: o MySQL trata cada NULL como um
  -- valor distinto em índices UNIQUE, então "option_id IS NULL" nunca
  -- colidia consigo mesmo — cada toggle do produto inteiro (option_id
  -- NULL) criava uma LINHA NOVA em vez de atualizar a existente. Isso é
  -- o que fazia produtos marcados como indisponíveis nunca conseguirem
  -- voltar a ficar disponíveis (a linha antiga com available=0 continuava
  -- lá). Usando COALESCE(option_id, 0) na chave, o conflito é detectado
  -- corretamente e o ON DUPLICATE KEY UPDATE atualiza a linha certa.
  option_id_key INT UNSIGNED GENERATED ALWAYS AS (COALESCE(option_id, 0)) STORED,
  available TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_avail_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_avail_option FOREIGN KEY (option_id) REFERENCES product_options(id),
  UNIQUE KEY uq_avail (availability_date, product_id, option_id_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. Dias de funcionamento / fechamento de pedidos
-- ------------------------------------------------------------
CREATE TABLE store_calendar (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  calendar_date DATE NOT NULL UNIQUE,
  orders_open TINYINT(1) NOT NULL DEFAULT 1, -- false = fechado para pedidos nesse dia
  note VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. Pedidos
--    ID interno != número público != token de consulta (IDOR)
-- ------------------------------------------------------------
CREATE TABLE orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,             -- ID interno (nunca exposto)
  public_order_number VARCHAR(12) NOT NULL UNIQUE,           -- ex: "UF-284193"
  access_token CHAR(43) NOT NULL UNIQUE,                     -- token aleatório p/ o aluno consultar o próprio pedido
  student_name VARCHAR(120) NOT NULL,
  class_name VARCHAR(30) NOT NULL,
  pickup_date DATE NOT NULL,
  pickup_window_start TIME NOT NULL DEFAULT '09:40:00',
  pickup_window_end TIME NOT NULL DEFAULT '10:00:00',
  total_amount_cents INT UNSIGNED NOT NULL,                  -- calculado no backend
  status ENUM(
    'aguardando_pagamento',
    'comprovante_enviado',
    'pagamento_confirmado',
    'em_preparacao',
    'pronto_para_retirada',
    'entregue',
    'cancelado',
    'pagamento_expirado'
  ) NOT NULL DEFAULT 'aguardando_pagamento',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pickup_date (pickup_date),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. Itens do pedido
-- ------------------------------------------------------------
CREATE TABLE order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  option_id INT UNSIGNED NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  unit_price_cents INT UNSIGNED NOT NULL,   -- snapshot do preço no momento da compra
  subtotal_cents INT UNSIGNED NOT NULL,
  CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_item_option FOREIGN KEY (option_id) REFERENCES product_options(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 8. Pagamentos (payload Pix gerado, sem armazenar a chave)
-- ------------------------------------------------------------
CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL UNIQUE,
  pix_payload TEXT NOT NULL,                -- "copia e cola" gerado (não é segredo)
  amount_cents INT UNSIGNED NOT NULL,
  status ENUM('pendente','confirmado','expirado') NOT NULL DEFAULT 'pendente',
  confirmed_by_admin_id INT UNSIGNED NULL,
  confirmed_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  -- Comprovante enviado pelo cliente (upload de imagem OU link colado).
  proof_type ENUM('upload','link') NULL,
  proof_image LONGTEXT NULL,                -- imagem em base64 (data URL), quando proof_type='upload'
  proof_url VARCHAR(500) NULL,              -- link colado, quando proof_type='link'
  proof_submitted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_admin FOREIGN KEY (confirmed_by_admin_id) REFERENCES admin_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 9. Configurações gerais (NÃO inclui a chave Pix — isso fica
--    só em variável de ambiente/secret manager do servidor)
-- ------------------------------------------------------------
CREATE TABLE settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 10. Logs de segurança / auditoria
-- ------------------------------------------------------------
CREATE TABLE security_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,              -- 'login','logout','price_change','pix_config_change', etc.
  details VARCHAR(500) NULL,                -- NUNCA senha, chave Pix ou token
  ip_address VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED inicial de produtos e opções
-- ============================================================
INSERT INTO products (slug, name, description, base_price_cents, requires_option, option_group, active)
VALUES
('sanduiche_natural', 'Sanduíche Natural', 'Feito com ingredientes frescos, leve, saboroso e perfeito para o dia a dia.', 700, 0, NULL, 1),
('cone_trufado', 'Cone Trufado', 'Casquinha crocante com recheio trufado e diversos sabores irresistíveis.', 800, 1, 'sabor_cone', 1);

-- O sanduíche natural não tem mais opção de "com/sem ervilha" (não mudava
-- preço nem produção). As linhas abaixo não existem mais para o produto 1;
-- veja migrate.js (step5) para instalações que já tinham essas opções.
INSERT INTO product_options (product_id, option_value, label, sort_order) VALUES
(2, 'maracuja', 'Maracujá', 1),
(2, 'ninho', 'Ninho', 2),
(2, 'brigadeiro', 'Brigadeiro', 3),
(2, 'brigadeiro_morango', 'Brigadeiro com morango', 4),
(2, 'brigadeiro_prestigio', 'Brigadeiro e Prestígio', 5);

INSERT INTO settings (setting_key, setting_value) VALUES
('pickup_window_start', '09:40'),
('pickup_window_end', '10:00'),
('pix_merchant_name', 'ULTIMA FATIA'),
('pix_merchant_city', 'DEFINIR CIDADE');

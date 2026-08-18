# Última Fatia — Sistema de Pedidos

Sistema completo de pedidos para venda de sanduíches naturais e cones
trufados no recreio escolar, com pagamento via Pix e painel administrativo.

## Estrutura

```
ultima-fatia/
├── backend/    → API Node.js/Express + MySQL (deploy: Railway)
└── frontend/   → Next.js (deploy: Vercel)
```

## 1. Banco de dados (MySQL / Railway)

1. Crie um banco MySQL no Railway.
2. Rode o script `backend/schema.sql` nele (cria as tabelas e já insere
   os produtos/opções do cardápio).

## 2. Backend (Railway)

1. Suba a pasta `backend/` como um projeto no Railway.
2. Configure as variáveis de ambiente (veja `.env.example`):
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
   - `JWT_SECRET` (gere uma string aleatória longa)
   - `PIX_KEY` (a chave Pix real — **nunca** vai para o frontend)
   - `PIX_MERCHANT_NAME`, `PIX_MERCHANT_CITY`
   - `FRONTEND_URL` (a URL do seu frontend na Vercel, para o CORS)
3. Depois do primeiro deploy, crie o usuário administrador rodando uma vez:
   ```
   node src/scripts/createAdmin.js seu_usuario "sua_senha_forte_aqui"
   ```
   (pode rodar via `railway run` ou um shell do serviço)

## 3. Frontend (Vercel)

1. Suba a pasta `frontend/` como projeto na Vercel.
2. Configure a variável de ambiente:
   - `NEXT_PUBLIC_API_URL` = URL pública do backend no Railway
3. Deploy.

## 4. Acessos

- Aluno: `https://seu-frontend.vercel.app/`
- Acompanhar pedido: `https://seu-frontend.vercel.app/pedido/<token>` (gerado automaticamente após o pedido)
- Admin: `https://seu-frontend.vercel.app/admin/login`

## Segurança implementada

- Preço e valor do Pix calculados **exclusivamente no backend**.
- Chave Pix só existe como variável de ambiente do servidor — nunca é
  enviada em nenhuma resposta de API, nunca é logada.
- Payload Pix (BR Code / EMV) gerado no servidor a partir do valor real do pedido.
- Pedido identificado por 3 valores separados: ID interno (nunca exposto),
  número público (`UF-xxxxxx`) e token de acesso aleatório (anti-IDOR).
- Senha de admin com bcrypt, bloqueio progressivo após 5 tentativas erradas,
  sessão em cookie `HttpOnly` + `Secure` + `SameSite=Strict`.
- Rate limiting em login, criação de pedidos, consulta de pedidos e API admin.
- Queries 100% parametrizadas (mysql2), nenhuma concatenação de string em SQL.
- Helmet + CSP, respostas de erro genéricas em produção, logs com redaction
  automática de segredos.
- Disponibilidade diária de produtos/sabores controlável pelo admin sem
  mexer no cadastro fixo.

## Pendências antes de produção

- Confirmação de pagamento é **manual** (o admin marca "pagamento confirmado"
  no painel), já que não há integração com PSP/gateway Pix.
- Rodar um pentest / revisão de segurança real antes de publicar (o sistema
  segue boas práticas, mas isso não substitui testes de segurança reais).
- Ajustar `PIX_MERCHANT_CITY` para a cidade real da escola.

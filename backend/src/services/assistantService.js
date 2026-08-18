// Assistente de matemática financeira para o painel admin.
//
// Segurança:
//  - A ANTHROPIC_API_KEY nunca sai do servidor (não existe no frontend).
//  - Só é chamada por rotas protegidas por requireAdmin + assistantLimiter.
//  - O histórico e o tamanho de cada mensagem são limitados aqui embaixo
//    também (defesa em profundidade — a rota já valida, mas o serviço
//    não confia cegamente em quem o chama).
const env = require('../config/env');
const logger = require('../utils/logger');

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

class AssistantError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

const SYSTEM_PROMPT = `Você é o assistente de matemática financeira do painel administrativo da
"Última Fatia", uma loja de lanches (sanduíche natural e cone trufado)
vendida para alunos via Pix, com retirada agendada na escola.

Seu papel é ajudar o administrador (provavelmente um aluno/professor de
Finanças ou Administração) a pensar sobre:
- precificação, markup e margem de contribuição por produto;
- ponto de equilíbrio (quantas unidades vender para cobrir custos fixos);
- fluxo de caixa simples, projeção de faturamento e metas de venda;
- análise de custos de ingredientes vs. preço de venda;
- juros, descontos e outros cálculos financeiros básicos aplicados a um
  pequeno negócio escolar.

Regras importantes:
- Sempre mostre o RACIOCÍNIO e a FÓRMULA usada, não só o resultado — o
  objetivo é ajudar a pessoa a aprender matemática financeira, não só
  entregar um número.
- Use valores em reais (R$) e responda em português do Brasil.
- Quando o admin fornecer números de vendas/pedidos reais do sistema
  (se aparecerem no contexto abaixo), use-os nos cálculos quando fizer
  sentido, mas deixe claro que são dados do dia consultado.
- Você não tem acesso a nenhuma ferramenta, ao banco de dados ao vivo,
  nem pode executar ações no sistema (confirmar pagamentos, mudar
  preços, etc.) — se pedirem isso, explique que precisa ser feito pelas
  telas do painel (Pedidos, Produtos, Disponibilidade).
- Não invente números de vendas que não foram fornecidos a você.
- Seja direto e didático. Respostas curtas quando a pergunta for
  simples; mais detalhadas quando envolver várias etapas de cálculo.`;

function buildSystemPrompt(contextSnapshot) {
  if (!contextSnapshot) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n\nContexto do dia consultado no painel (use se for relevante):\n${contextSnapshot}`;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AssistantError('Envie ao menos uma mensagem.', 400);
  }
  if (messages.length > MAX_MESSAGES) {
    throw new AssistantError(`Histórico muito longo (máximo ${MAX_MESSAGES} mensagens). Inicie uma nova conversa.`, 400);
  }
  return messages.map((m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      throw new AssistantError('Formato de mensagem inválido.', 400);
    }
    const content = m.content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (content.length === 0) {
      throw new AssistantError('Mensagem vazia.', 400);
    }
    return { role: m.role, content };
  });
}

async function askAssistant(messages, contextSnapshot) {
  if (!env.assistant.apiKey) {
    throw new AssistantError('Assistente não configurado. Defina ANTHROPIC_API_KEY no backend.', 503);
  }

  const cleanMessages = sanitizeMessages(messages);

  let response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.assistant.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.assistant.model,
        max_tokens: 1024,
        system: buildSystemPrompt(contextSnapshot),
        messages: cleanMessages,
      }),
    });
  } catch (err) {
    logger.error('[assistant] Falha de rede ao chamar a API da Anthropic', { error: err.message });
    throw new AssistantError('Não foi possível falar com o assistente agora. Tente novamente.', 502);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error('[assistant] Resposta de erro da API da Anthropic', { status: response.status, body: body.slice(0, 500) });
    throw new AssistantError('O assistente não conseguiu responder agora. Tente novamente em instantes.', 502);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((block) => block.type === 'text');
  if (!textBlock) {
    throw new AssistantError('O assistente não retornou uma resposta válida.', 502);
  }
  return textBlock.text;
}

module.exports = { askAssistant, AssistantError };

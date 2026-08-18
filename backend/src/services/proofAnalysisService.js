// Pré-análise automática de comprovantes de pagamento com IA (visão).
//
// ATENÇÃO — o que isso NÃO é: isso não é uma verificação bancária real.
// O sistema não tem integração com nenhum PSP/banco (não há webhook de
// pagamento), então não existe forma de confirmar de verdade que o Pix
// caiu na conta. O que esta função faz é ler a IMAGEM do comprovante e
// dar uma opinião: se ela parece mesmo uma tela de comprovante Pix, qual
// valor aparece nela, e se esse valor bate com o valor do pedido. É um
// apoio para o admin decidir mais rápido — a confirmação final continua
// sendo manual, clicando em "Pagamento confirmado" na tela de Pedidos.
const env = require('../config/env');
const logger = require('../utils/logger');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

class ProofAnalysisError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

const SYSTEM_PROMPT = `Você analisa fotos/prints de comprovantes de pagamento Pix enviados por
alunos para confirmar a compra de lanches na loja "Última Fatia". Você
NÃO tem acesso a nenhum sistema bancário — sua análise é só visual, uma
pré-triagem para ajudar um humano a decidir mais rápido.

Seja RIGOROSO e cético por padrão. A imagem só conta como comprovante de
pagamento Pix real se ela mostrar claramente uma tela de aplicativo
bancário ou instituição de pagamento, com valor, data/hora e (idealmente)
identificação do destinatário/pagador — no formato típico de comprovante
de transação Pix. Qualquer imagem que não seja isso — foto de produto,
print de conversa, papel, documento genérico, tela de outro app, imagem
sem nenhum dado financeiro visível, ou qualquer coisa que não pareça
comprovante bancário — deve ser marcada como "parece_comprovante_pagamento":
false, mesmo que a imagem tenha alguma semelhança superficial. Na dúvida,
marque como false e explique o motivo em "sinais_de_alerta".

Você vai receber, junto com a imagem: o valor esperado do pedido, o nome
do aluno que fez o pedido, e o horário em que o QR Code Pix foi gerado
pelo sistema. Um comprovante só é válido se TODOS os pontos abaixo forem
verdadeiros:
1) a imagem é mesmo uma tela de comprovante de pagamento Pix real;
2) o valor pago bate com o valor esperado do pedido;
3) o horário/data do pagamento no comprovante é IGUAL OU POSTERIOR ao
   horário em que o QR Code foi gerado (nunca pode ser antes — um
   comprovante com data anterior à geração do QR não pode ser deste
   pedido, ainda que o valor bata);
4) quando o comprovante mostra nome de pagador/remetente, ele é
   razoavelmente compatível com o nome do aluno informado (aceite
   variações razoáveis de nome, já que quem paga pode ser um
   responsável/familiar — mas sinalize se o nome for claramente
   diferente e não relacionado).

Responda SOMENTE com um JSON válido, sem texto antes ou depois, nesse
formato exato:
{
  "parece_comprovante_pagamento": true ou false,
  "valor_detectado_reais": número (ex: 7.00) ou null se não conseguir ler,
  "valor_bate_com_pedido": true, false, ou null (se não deu pra comparar),
  "horario_detectado": string curta (ex: "17/08/2026 09:12") ou null,
  "horario_posterior_ao_qr": true, false, ou null (se não deu pra avaliar),
  "nome_detectado": string curta ou null,
  "nome_compativel": true, false, ou null (se não deu pra avaliar),
  "instituicao_detectada": string curta (ex: "Nubank", "Banco do Brasil") ou null,
  "sinais_de_alerta": array de strings curtas com qualquer coisa suspeita
    (print editado, valores inconsistentes, imagem não é de um app
    bancário/Pix, horário anterior à geração do QR, nome incompatível,
    etc.) — array vazio se nada suspeito,
  "comprovante_valido": true SOMENTE se os 4 pontos acima forem
    verdadeiros (ou o ponto 4 não avaliável por falta de nome no
    comprovante) e nenhum sinal de alerta grave; false caso contrário,
  "confianca": "alta", "media" ou "baixa",
  "resumo": string curta (1 frase) explicando sua conclusão para o admin
}`;

function buildUserText({ expectedAmountCents, studentName, qrGeneratedAt }) {
  const expectedReais = (expectedAmountCents / 100).toFixed(2);
  const qrTime = qrGeneratedAt ? new Date(qrGeneratedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'desconhecido';
  return `Valor esperado deste pedido: R$ ${expectedReais}. Nome do aluno no pedido: ${studentName || 'não informado'}. ` +
    `Horário em que o QR Code Pix foi gerado: ${qrTime}. Analise a imagem em anexo e responda no formato JSON pedido.`;
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mediaType: match[1], base64Data: match[2] };
}

async function analyzeProofImage(proofImageDataUrl, { expectedAmountCents, studentName, qrGeneratedAt }) {
  if (!env.assistant.apiKey) {
    throw new ProofAnalysisError('Assistente não configurado. Defina ANTHROPIC_API_KEY no backend.', 503);
  }

  const parsed = parseDataUrl(proofImageDataUrl);
  if (!parsed) {
    throw new ProofAnalysisError('Comprovante corrompido ou em formato não suportado para análise.', 400);
  }

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
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64Data } },
              { type: 'text', text: buildUserText({ expectedAmountCents, studentName, qrGeneratedAt }) },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    logger.error('[proofAnalysis] Falha de rede ao chamar a API da Anthropic', { error: err.message });
    throw new ProofAnalysisError('Não foi possível analisar o comprovante agora. Tente novamente.', 502);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error('[proofAnalysis] Resposta de erro da API da Anthropic', { status: response.status, body: body.slice(0, 500) });
    throw new ProofAnalysisError('O assistente não conseguiu analisar o comprovante agora.', 502);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((block) => block.type === 'text');
  if (!textBlock) {
    throw new ProofAnalysisError('A análise não retornou um resultado válido.', 502);
  }

  try {
    const cleaned = textBlock.text.trim().replace(/^```json\s*|\s*```$/g, '');
    return JSON.parse(cleaned);
  } catch {
    logger.warn('[proofAnalysis] Resposta da IA não veio em JSON válido', { raw: textBlock.text.slice(0, 300) });
    return {
      parece_comprovante_pagamento: null,
      valor_detectado_reais: null,
      valor_bate_com_pedido: null,
      horario_detectado: null,
      horario_posterior_ao_qr: null,
      nome_detectado: null,
      nome_compativel: null,
      instituicao_detectada: null,
      sinais_de_alerta: [],
      comprovante_valido: false,
      confianca: 'baixa',
      resumo: 'Não foi possível interpretar a análise automaticamente. Confira a imagem manualmente.',
    };
  }
}

module.exports = { analyzeProofImage, ProofAnalysisError };

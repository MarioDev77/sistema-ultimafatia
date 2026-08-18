'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import AdminNav from '../../../components/AdminNav';

const SUGGESTIONS = [
  'Qual o markup ideal para o Cone Trufado se o ingrediente custa R$ 3,20?',
  'Quantos sanduíches preciso vender por dia para cobrir R$ 200 de custo fixo mensal?',
  'Compare Cone Trufado e Sanduíche Natural, custos R$ 3,20 e R$ 4,00.',
  'Qual a previsão de faturamento pro próximo mês?',
  'Quais pedidos estão pendentes de pagamento?',
];

export default function AssistentePage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [includeContext, setIncludeContext] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const boxRef = useRef(null);

  useEffect(() => {
    api.adminMe().catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [messages, loading]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setError('');
    setLoading(true);
    try {
      const res = await api.adminAssistantChat(nextMessages, includeContext);
      setMessages([...nextMessages, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setError(err.message);
      setMessages(messages); // desfaz a mensagem otimista se falhou
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-container">
      <AdminNav />

      <div className="card">
        <div className="product-title">Assistente de matemática financeira</div>
        <div className="subtitle" style={{ marginTop: 4 }}>
          Especializado só em matemática financeira e dados da loja — 100% local, sem API de IA. Tira dúvidas
          de precificação, margem, markup, ponto de equilíbrio, comparação entre produtos, projeção de
          faturamento e pedidos (inclusive por nome do aluno). Não confirma pagamentos nem altera dados —
          isso continua sendo feito nas outras abas.
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, marginTop: 12 }}>
          <input type="checkbox" checked={includeContext} onChange={(e) => setIncludeContext(e.target.checked)} />
          Incluir faturamento e pedidos de hoje na conversa
        </label>
      </div>

      <div className="card">
        <div className="chat-box" ref={boxRef}>
          {messages.length === 0 && (
            <div className="subtitle" style={{ marginBottom: 4 }}>
              Sugestões:
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {SUGGESTIONS.map((s) => (
                  <div key={s} className="option-pill" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => send(s)}>
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          {loading && <div className="chat-bubble assistant">Pensando…</div>}
        </div>

        {error && <div className="error-text">{error}</div>}

        <div className="chat-input-row">
          <textarea
            className="input"
            style={{ marginBottom: 0 }}
            rows={2}
            placeholder="Pergunte algo sobre precificação, margem, fluxo de caixa..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn-primary" style={{ width: 'auto', padding: '14px 20px' }} disabled={loading || !input.trim()} onClick={() => send()}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

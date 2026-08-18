'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatCents } from '../../../lib/api';
import AdminNav from '../../../components/AdminNav';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_OPTIONS = [
  'aguardando_pagamento',
  'comprovante_enviado',
  'pagamento_confirmado',
  'em_preparacao',
  'pronto_para_retirada',
  'entregue',
  'cancelado',
  'pagamento_expirado',
];

const STATUS_LABELS = {
  aguardando_pagamento: 'Aguardando pagamento',
  comprovante_enviado: 'Comprovante enviado — conferir',
  pagamento_confirmado: 'Pagamento confirmado',
  em_preparacao: 'Em preparação',
  pronto_para_retirada: 'Pronto para retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
  pagamento_expirado: 'Pagamento expirado',
};

export default function OrdersPage() {
  const [date, setDate] = useState(todayISO());
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [analyses, setAnalyses] = useState({}); // { [orderId]: { loading, result, error } }
  const router = useRouter();

  function load() {
    api
      .adminOrders(date)
      .then(setOrders)
      .catch((err) => {
        setError(err.message);
        if (err.message.includes('autenticado')) router.push('/admin/login');
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function changeStatus(id, status) {
    try {
      await api.adminUpdateOrderStatus(id, status);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function analyzeProof(id) {
    setAnalyses((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const { analysis } = await api.adminAnalyzeProof(id);
      setAnalyses((prev) => ({ ...prev, [id]: { loading: false, result: analysis } }));
    } catch (err) {
      setAnalyses((prev) => ({ ...prev, [id]: { loading: false, error: err.message } }));
    }
  }

  return (
    <div className="admin-container">
      <AdminNav />
      <div className="card">
        <label className="label">Data de retirada</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200, marginBottom: 0 }} />
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Aluno</th>
              <th>Turma</th>
              <th>Valor</th>
              <th>Pagamento</th>
              <th>Comprovante</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.public_order_number}</td>
                <td>{o.student_name}</td>
                <td>{o.class_name}</td>
                <td>{formatCents(o.total_amount_cents)}</td>
                <td>{o.payment_status || '—'}</td>
                <td>
                  {o.proof_type ? (
                    <>
                      <a
                        href={`${API_URL}/api/admin/orders/${o.id}/payment-proof/image`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ver
                      </a>
                      {o.proof_type === 'upload' && (
                        <ProofAnalysisCell orderId={o.id} state={analyses[o.id]} onAnalyze={() => analyzeProof(o.id)} />
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <select
                    className="input"
                    style={{ margin: 0, padding: '6px 8px', fontSize: 13 }}
                    value={o.status}
                    onChange={(e) => changeStatus(o.id, e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7}>Nenhum pedido para esta data.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// Mostra o botão "Analisar (IA)" e, depois de clicado, um resumo curto
// da pré-análise (não é confirmação bancária — ver aviso no backend).
function ProofAnalysisCell({ state, onAnalyze }) {
  if (!state) {
    return (
      <div>
        <button
          type="button"
          onClick={onAnalyze}
          style={{ background: 'none', border: 'none', color: 'var(--orange)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: '2px 0' }}
        >
          Analisar (IA)
        </button>
      </div>
    );
  }

  if (state.loading) {
    return <div className="subtitle" style={{ fontSize: 12 }}>Analisando…</div>;
  }

  if (state.error) {
    return <div className="error-text" style={{ fontSize: 12 }}>{state.error}</div>;
  }

  const r = state.result;
  const veredito =
    r.comprovante_valido === true ? '✓ Comprovante válido' : r.comprovante_valido === false ? '✗ Comprovante inválido' : 'Não avaliado';
  const veredictColor = r.comprovante_valido === true ? 'var(--green-ok)' : r.comprovante_valido === false ? 'var(--red-danger)' : 'var(--brown-mid)';

  return (
    <div style={{ fontSize: 12, marginTop: 4, maxWidth: 240 }}>
      <div style={{ color: veredictColor, fontWeight: 700 }}>{veredito}</div>
      <div>
        {r.valor_detectado_reais != null ? `R$ ${Number(r.valor_detectado_reais).toFixed(2)}` : 'Valor não identificado'}
        {r.valor_bate_com_pedido === true && ' ✓ valor bate'}
        {r.valor_bate_com_pedido === false && ' ✗ valor não bate'}
      </div>
      {r.horario_posterior_ao_qr === false && (
        <div style={{ color: 'var(--red-danger)' }}>⚠ horário do comprovante é anterior à geração do Pix</div>
      )}
      {r.nome_compativel === false && <div style={{ color: 'var(--red-danger)' }}>⚠ nome no comprovante não bate com o aluno</div>}
      {r.sinais_de_alerta && r.sinais_de_alerta.length > 0 && (
        <div style={{ color: 'var(--red-danger)' }}>⚠ {r.sinais_de_alerta.join('; ')}</div>
      )}
      <div className="subtitle" style={{ fontSize: 11.5 }}>{r.resumo} (confiança: {r.confianca})</div>
    </div>
  );
}

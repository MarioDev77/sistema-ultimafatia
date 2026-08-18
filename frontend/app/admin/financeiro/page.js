'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatCents } from '../../../lib/api';
import AdminNav from '../../../components/AdminNav';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const PAYMENT_STATUS_LABELS = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  expirado: 'Expirado',
};

const PROOF_TYPE_LABELS = {
  upload: 'Imagem enviada',
  link: 'Link colado',
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function FinanceiroPage() {
  const [from, setFrom] = useState(daysAgoISO(7));
  const [to, setTo] = useState(todayISO());
  const [onlyWithProof, setOnlyWithProof] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const router = useRouter();

  function load() {
    api
      .adminPayments(from, to, onlyWithProof)
      .then(setData)
      .catch((err) => {
        setError(err.message);
        if (err.message.includes('autenticado')) router.push('/admin/login');
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, onlyWithProof]);

  return (
    <div className="admin-container">
      <AdminNav />

      <div className="card">
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="label">De</label>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 170, marginBottom: 0 }} />
          </div>
          <div>
            <label className="label">Até</label>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 170, marginBottom: 0 }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, paddingBottom: 12 }}>
            <input type="checkbox" checked={onlyWithProof} onChange={(e) => setOnlyWithProof(e.target.checked)} />
            Só com comprovante
          </label>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      {data && (
        <>
          <div className="card">
            <div className="product-title">Faturamento confirmado no período</div>
            <div className="product-price" style={{ fontSize: 22 }}>{formatCents(data.confirmed_revenue_cents)}</div>
            <div className="subtitle">{data.confirmed_count} pedido(s) confirmado(s), em preparo, prontos ou entregues</div>
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Aluno</th>
                  <th>Data retirada</th>
                  <th>Valor</th>
                  <th>Pagamento</th>
                  <th>Comprovante</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.order_id}>
                    <td>{p.public_order_number}</td>
                    <td>{p.student_name}</td>
                    <td>{p.pickup_date?.slice(0, 10).split('-').reverse().join('/')}</td>
                    <td>{formatCents(p.total_amount_cents)}</td>
                    <td>{p.payment_status ? PAYMENT_STATUS_LABELS[p.payment_status] || p.payment_status : '—'}</td>
                    <td>
                      {p.proof_type ? (
                        <a
                          href={`${API_URL}/api/admin/orders/${p.order_id}/payment-proof/image`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {PROOF_TYPE_LABELS[p.proof_type] || 'Ver'}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {data.payments.length === 0 && (
                  <tr>
                    <td colSpan={6}>Nenhum pedido nesse período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

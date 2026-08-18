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
  'pagamento_confirmado',
  'em_preparacao',
  'pronto_para_retirada',
  'entregue',
  'cancelado',
  'pagamento_expirado',
];

const STATUS_LABELS = {
  aguardando_pagamento: 'Aguardando pagamento',
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

  return (
    <div className="admin-container">
      <AdminNav />
      <div className="card">
        <label className="label">Data de retirada</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200, marginBottom: 0 }} />
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card">
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
                    <a
                      href={`${API_URL}/api/admin/orders/${o.id}/payment-proof/image`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver
                    </a>
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
  );
}

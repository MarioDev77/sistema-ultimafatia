'use client';

import { useEffect, useState } from 'react';
import { api, formatCents } from '../../../lib/api';

const STATUS_LABELS = {
  aguardando_pagamento: { text: 'Aguardando pagamento', className: 'badge-waiting' },
  pagamento_confirmado: { text: 'Pagamento confirmado', className: 'badge-paid' },
  em_preparacao: { text: 'Em preparação', className: 'badge-preparing' },
  pronto_para_retirada: { text: 'Pronto para retirada', className: 'badge-ready' },
  entregue: { text: 'Entregue', className: 'badge-delivered' },
  cancelado: { text: 'Cancelado', className: 'badge-cancelled' },
  pagamento_expirado: { text: 'Pagamento expirado', className: 'badge-cancelled' },
};

export default function OrderStatusPage({ params }) {
  const { token } = params;
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let interval;
    function load() {
      api
        .getOrder(token)
        .then(setOrder)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
    load();
    interval = setInterval(load, 15000); // atualiza status a cada 15s
    return () => clearInterval(interval);
  }, [token]);

  return (
    <div className="container">
      <div className="header">
        <div className="logo-badge">🥪</div>
        <div>
          <div className="title">Última Fatia</div>
          <div className="subtitle">Acompanhamento do pedido</div>
        </div>
      </div>

      {loading && <div className="card">Carregando...</div>}
      {error && <div className="card error-text">{error}</div>}

      {order && (
        <>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="subtitle">Pedido nº</div>
            <div className="title" style={{ fontSize: 22 }}>
              {order.public_order_number}
            </div>
            <div style={{ marginTop: 10 }}>
              <span className={`badge ${STATUS_LABELS[order.status]?.className || ''}`}>
                {STATUS_LABELS[order.status]?.text || order.status}
              </span>
            </div>
          </div>

          <div className="card">
            <div className="summary-row">
              <span>Nome</span>
              <span>{order.student_name}</span>
            </div>
            <div className="summary-row">
              <span>Turma</span>
              <span>{order.class_name}</span>
            </div>
            <div className="summary-row">
              <span>Retirada</span>
              <span>{String(order.pickup_date).slice(0, 10).split('-').reverse().join('/')}</span>
            </div>
            <div className="summary-row">
              <span>Horário</span>
              <span>09:40 às 10:00</span>
            </div>
          </div>

          <div className="card">
            {order.items.map((item, idx) => (
              <div className="summary-row" key={idx}>
                <span>
                  {item.quantity}x {item.product_name}
                  {item.option_label ? ` (${item.option_label})` : ''}
                </span>
                <span>{formatCents(item.subtotal_cents)}</span>
              </div>
            ))}
            <div className="total-row">
              <span>Total</span>
              <span>{formatCents(order.total_amount_cents)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

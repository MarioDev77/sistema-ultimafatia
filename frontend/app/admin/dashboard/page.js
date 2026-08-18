'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatCents } from '../../../lib/api';
import AdminNav from '../../../components/AdminNav';

const CONE_FLAVOR_LABELS = {
  maracuja: 'Maracujá',
  ninho: 'Ninho',
  brigadeiro: 'Brigadeiro',
  brigadeiro_morango: 'Brigadeiro com morango',
  brigadeiro_prestigio: 'Brigadeiro e Prestígio',
};

const STATUS_LABELS = {
  aguardando_pagamento: 'Aguardando pagamento',
  pagamento_confirmado: 'Pagamento confirmado',
  em_preparacao: 'Em preparação',
  pronto_para_retirada: 'Pronto para retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
  pagamento_expirado: 'Pagamento expirado',
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    api
      .adminMe()
      .catch(() => router.push('/admin/login'));
  }, [router]);

  useEffect(() => {
    api.adminDashboard(date).then(setData).catch((err) => setError(err.message));
  }, [date]);

  const sanduiches = data?.production.filter((p) => p.product_slug === 'sanduiche_natural') || [];
  const cones = data?.production.filter((p) => p.product_slug === 'cone_trufado') || [];

  return (
    <div className="admin-container">
      <AdminNav />
      <div className="card">
        <label className="label">Data</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200, marginBottom: 0 }} />
      </div>

      {error && <div className="error-text">{error}</div>}

      {data && (
        <>
          <div className="card">
            <div className="product-title">Pedidos de hoje</div>
            <table>
              <tbody>
                {Object.entries(STATUS_LABELS).map(([key, label]) => {
                  const row = data.status_counts.find((s) => s.status === key);
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{row ? row.total : 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="product-title">Faturamento confirmado</div>
            <div className="product-price" style={{ fontSize: 22 }}>{formatCents(data.revenue_cents)}</div>
          </div>

          <div className="card">
            <div className="product-title">Produção — Sanduíches</div>
            <table>
              <tbody>
                <tr>
                  <td>Com ervilha</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {sanduiches.find((s) => s.option_value === 'com_ervilha')?.total_qty || 0}
                  </td>
                </tr>
                <tr>
                  <td>Sem ervilha</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {sanduiches.find((s) => s.option_value === 'sem_ervilha')?.total_qty || 0}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="product-title">Produção — Cones</div>
            <table>
              <tbody>
                {Object.keys(CONE_FLAVOR_LABELS).map((flavor) => (
                  <tr key={flavor}>
                    <td>{CONE_FLAVOR_LABELS[flavor]}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {cones.find((c) => c.option_value === flavor)?.total_qty || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

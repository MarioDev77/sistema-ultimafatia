'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatCents } from '../../../lib/api';
import AdminNav from '../../../components/AdminNav';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ComprovantesPage() {
  const [from, setFrom] = useState(daysAgoISO(14));
  const [to, setTo] = useState(todayISO());
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [orderNumberInput, setOrderNumberInput] = useState('');
  const [captureOrder, setCaptureOrder] = useState(null); // pedido buscado pra anexar foto
  const [captureError, setCaptureError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const router = useRouter();

  function load() {
    api
      .adminPaymentProofs(from, to)
      .then(setPhotos)
      .catch((err) => {
        setError(err.message);
        if (err.message.includes('autenticado')) router.push('/admin/login');
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  async function findOrderByNumber() {
    setCaptureError('');
    setCaptureOrder(null);
    const num = orderNumberInput.trim();
    if (!num) return;
    try {
      // O painel de pedidos já traz o dia todo; buscamos no dia de hoje e,
      // se não achar, no período selecionado acima.
      const candidates = await api.adminOrders(todayISO());
      const found = candidates.find((o) => o.public_order_number.toLowerCase() === num.toLowerCase());
      if (!found) {
        setCaptureError('Pedido não encontrado em hoje. Confira o número (ex: UF-284193).');
        return;
      }
      setCaptureOrder(found);
    } catch (err) {
      setCaptureError(err.message);
    }
  }

  async function handleCapture(file) {
    if (!captureOrder || !file) return;
    setCapturing(true);
    setCaptureError('');
    try {
      await api.adminCapturePaymentProof(captureOrder.id, file);
      setCaptureOrder(null);
      setOrderNumberInput('');
      load();
    } catch (err) {
      setCaptureError(err.message);
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="admin-container">
      <AdminNav />

      <div className="card">
        <div className="product-title" style={{ marginBottom: 8 }}>
          Fotografar comprovante do cliente
        </div>
        <div className="subtitle" style={{ marginBottom: 12 }}>
          Digite o número do pedido (ex: UF-284193) e tire a foto do comprovante mostrado pelo aluno no balcão.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <input
            className="input"
            style={{ marginBottom: 0, flex: '1 1 160px' }}
            placeholder="Número do pedido"
            value={orderNumberInput}
            onChange={(e) => setOrderNumberInput(e.target.value)}
          />
          <button className="btn-secondary" style={{ width: 'auto', padding: '10px 16px' }} onClick={findOrderByNumber}>
            Buscar
          </button>
        </div>

        {captureError && <div className="error-text">{captureError}</div>}

        {captureOrder && (
          <div style={{ background: 'var(--cream-light)', borderRadius: 12, padding: 10 }}>
            <div style={{ fontWeight: 700 }}>{captureOrder.student_name}</div>
            <div className="subtitle" style={{ marginBottom: 10 }}>
              {captureOrder.public_order_number} — {formatCents(captureOrder.total_amount_cents)}
            </div>
            <label className="btn-primary" style={{ display: 'block', textAlign: 'center', cursor: capturing ? 'wait' : 'pointer' }}>
              {capturing ? 'Enviando...' : '📷 Tirar foto do comprovante'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                disabled={capturing}
                onChange={(e) => handleCapture(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
          <div>
            <label className="label">De</label>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 170, marginBottom: 0 }} />
          </div>
          <div>
            <label className="label">Até</label>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 170, marginBottom: 0 }} />
          </div>
        </div>

        {error && <div className="error-text">{error}</div>}

        <div className="product-title" style={{ marginBottom: 10 }}>
          Fotos de comprovantes ({photos.length})
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {photos.map((p) => (
            <a
              key={p.order_id}
              href={`${API_URL}/api/admin/orders/${p.order_id}/payment-proof/image`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #eee', height: 110 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_URL}/api/admin/orders/${p.order_id}/payment-proof/image`}
                  alt={`Comprovante ${p.public_order_number}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div style={{ fontSize: 12, marginTop: 4, fontWeight: 700 }}>{p.public_order_number}</div>
              <div className="subtitle" style={{ fontSize: 11.5 }}>
                {p.student_name} — {formatCents(p.total_amount_cents)}
              </div>
            </a>
          ))}
          {photos.length === 0 && <div className="subtitle">Nenhum comprovante fotografado nesse período.</div>}
        </div>
      </div>
    </div>
  );
}

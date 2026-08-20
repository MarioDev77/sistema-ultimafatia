'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import AdminNav from '../../../components/AdminNav';

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function AvailabilityPage() {
  // Mesma data que o cliente vê por padrão na tela de compra (retirada é
  // sempre pro dia seguinte) — assim o admin edita o mesmo dia que o
  // aluno está olhando, e não "hoje" enquanto o aluno já está em "amanhã".
  const [date, setDate] = useState(tomorrowISO());
  const [allProducts, setAllProducts] = useState([]);
  const [menu, setMenu] = useState([]); // estado salvo no servidor
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [pending, setPending] = useState({}); // key -> boolean, ainda não salvo
  const [pendingOrdersOpen, setPendingOrdersOpen] = useState(null); // null = sem alteração pendente
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminProducts().then(setAllProducts).catch(() => {});
  }, []);

  function load() {
    setLoading(true);
    api
      .adminAvailability(date)
      .then((data) => {
        setMenu(data.menu);
        setOrdersOpen(data.ordersOpen);
        setPending({});
        setPendingOrdersOpen(null);
        setSaveMessage('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [date]);

  function baselineAvailable(productId, optionId) {
    const product = menu.find((p) => p.id === productId);
    if (!product) return false;
    if (optionId === null) return true; // está na lista = produto disponível
    return product.options.some((o) => o.id === optionId);
  }

  function effectiveAvailable(productId, optionId) {
    const key = `${productId}:${optionId ?? 'null'}`;
    return key in pending ? pending[key] : baselineAvailable(productId, optionId);
  }

  function toggle(productId, optionId) {
    const key = `${productId}:${optionId ?? 'null'}`;
    const current = effectiveAvailable(productId, optionId);
    setPending((prev) => ({ ...prev, [key]: !current }));
    setSaveMessage('');
  }

  const effectiveOrdersOpen = pendingOrdersOpen === null ? ordersOpen : pendingOrdersOpen;
  const hasChanges = Object.keys(pending).length > 0 || pendingOrdersOpen !== null;

  async function saveChanges() {
    setSaving(true);
    setError('');
    try {
      if (pendingOrdersOpen !== null) {
        await api.adminSetCalendar({ date, orders_open: pendingOrdersOpen });
      }
      for (const key of Object.keys(pending)) {
        const [productIdStr, optionIdStr] = key.split(':');
        await api.adminSetAvailability({
          date,
          product_id: Number(productIdStr),
          option_id: optionIdStr === 'null' ? null : Number(optionIdStr),
          available: pending[key],
        });
      }
      setSaveMessage('Alterações salvas!');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-container">
      <AdminNav />

      <div className="card">
        <label className="label">Data</label>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} />
        <button
          className={effectiveOrdersOpen ? 'btn-secondary' : 'btn-primary'}
          onClick={() => {
            setPendingOrdersOpen(!effectiveOrdersOpen);
            setSaveMessage('');
          }}
        >
          {effectiveOrdersOpen ? 'Fechar pedidos deste dia' : 'Reabrir pedidos deste dia'}
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <div className="product-title" style={{ marginBottom: 10 }}>
          Produtos e sabores disponíveis em {date.split('-').reverse().join('/')}
        </div>
        <div className="subtitle" style={{ marginBottom: 14 }}>
          Toque pra marcar o que muda. Nada é salvo até você tocar em "Salvar alterações" no fim.
        </div>

        {loading && <div className="subtitle">Carregando...</div>}

        {!loading &&
          allProducts.map((full) => (
            <div key={full.id} style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #eee' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="product-title">{full.name}</div>
                <div
                  className={`option-pill ${effectiveAvailable(full.id, null) ? 'selected' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggle(full.id, null)}
                >
                  {effectiveAvailable(full.id, null) ? 'Disponível' : 'Indisponível'}
                </div>
              </div>

              {full.requires_option && (
                <div className="option-group" style={{ marginTop: 10 }}>
                  {full.options
                    .filter((o) => o.active)
                    .map((opt) => (
                      <div
                        key={opt.id}
                        className={`option-pill ${effectiveAvailable(full.id, opt.id) ? 'selected' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => toggle(full.id, opt.id)}
                      >
                        {opt.label}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}

        {saveMessage && <div style={{ color: 'var(--green-ok)', fontWeight: 700, marginBottom: 10 }}>✓ {saveMessage}</div>}

        <button className="btn-primary" disabled={!hasChanges || saving} onClick={saveChanges}>
          {saving ? 'Salvando...' : hasChanges ? 'Salvar alterações' : 'Nenhuma alteração pendente'}
        </button>
      </div>
    </div>
  );
}

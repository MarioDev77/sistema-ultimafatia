'use client';

import { useEffect, useState } from 'react';
import { api, formatCents } from '../../../lib/api';
import AdminNav from '../../../components/AdminNav';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [editingPrice, setEditingPrice] = useState({}); // productId -> string em reais

  function load() {
    api.adminProducts().then(setProducts).catch((err) => setError(err.message));
  }

  useEffect(load, []);

  async function savePrice(productId) {
    const raw = editingPrice[productId];
    const value = Number(String(raw).replace(',', '.'));
    if (Number.isNaN(value) || value <= 0) {
      setError('Preço inválido.');
      return;
    }
    try {
      await api.adminUpdateProduct(productId, { base_price_cents: Math.round(value * 100) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(product) {
    try {
      await api.adminUpdateProduct(product.id, { active: !product.active });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-container">
      <AdminNav />
      {error && <div className="error-text">{error}</div>}

      {products.map((p) => (
        <div className="card" key={p.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="product-title">{p.name}</div>
            <div
              className={`option-pill ${p.active ? 'selected' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => toggleActive(p)}
            >
              {p.active ? 'Ativo' : 'Inativo'}
            </div>
          </div>
          <div className="product-desc">{p.description}</div>

          <div className="qty-row" style={{ marginTop: 10 }}>
            <span className="subtitle">Preço atual: {formatCents(p.base_price_cents)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              className="input"
              style={{ marginBottom: 0 }}
              placeholder="Novo preço (ex: 7,50)"
              value={editingPrice[p.id] ?? ''}
              onChange={(e) => setEditingPrice((prev) => ({ ...prev, [p.id]: e.target.value }))}
            />
            <button className="btn-secondary" style={{ width: 'auto', padding: '10px 16px' }} onClick={() => savePrice(p.id)}>
              Salvar
            </button>
          </div>

          {p.options.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="label">Opções cadastradas</div>
              <div className="option-group">
                {p.options.map((opt) => (
                  <div key={opt.id} className="option-pill selected" style={{ cursor: 'default' }}>
                    {opt.label}
                  </div>
                ))}
              </div>
              <div className="subtitle" style={{ marginTop: 6 }}>
                Para ativar/desativar por dia específico, use a aba Disponibilidade.
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

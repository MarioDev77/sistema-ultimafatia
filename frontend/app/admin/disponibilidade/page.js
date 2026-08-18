'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import AdminNav from '../../../components/AdminNav';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AvailabilityPage() {
  const [date, setDate] = useState(todayISO());
  const [menu, setMenu] = useState([]);
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .adminAvailability(date)
      .then((data) => {
        setMenu(data.menu);
        setOrdersOpen(data.ordersOpen);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [date]);

  async function toggleOrdersOpen() {
    setSaving(true);
    try {
      await api.adminSetCalendar({ date, orders_open: !ordersOpen });
      setOrdersOpen(!ordersOpen);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleProduct(product) {
    // menu já vem filtrado pelo que está disponível; então se está na
    // lista, está disponível — clicar desativa (e vice-versa).
    const currentlyAvailable = menu.some((p) => p.id === product.id);
    setSaving(true);
    try {
      await api.adminSetAvailability({ date, product_id: product.id, option_id: null, available: !currentlyAvailable });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleOption(product, option, currentlyAvailable) {
    setSaving(true);
    try {
      await api.adminSetAvailability({
        date,
        product_id: product.id,
        option_id: option.id,
        available: !currentlyAvailable,
      });
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
        <button className={ordersOpen ? 'btn-secondary' : 'btn-primary'} disabled={saving} onClick={toggleOrdersOpen}>
          {ordersOpen ? 'Fechar pedidos deste dia' : 'Reabrir pedidos deste dia'}
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <div className="product-title" style={{ marginBottom: 10 }}>
          Produtos e sabores disponíveis em {date.split('-').reverse().join('/')}
        </div>
        <div className="subtitle" style={{ marginBottom: 14 }}>
          Clique para ativar/desativar. Isso não altera o cadastro fixo — vale só para esta data. Por padrão
          tudo começa <strong>disponível</strong>; clique num sabor para escondê-lo do cliente hoje (fica
          riscado e tracejado em vermelho) — clique de novo para trazê-lo de volta.
        </div>

        {['sanduiche_natural', 'cone_trufado'].map((slug) => {
          // Busca o produto mesmo que esteja indisponível hoje, olhando a lista completa de opções vinda do backend.
          const product = menu.find((p) => p.slug === slug);
          return (
            <ProductAvailabilityBlock
              key={slug}
              slug={slug}
              product={product}
              date={date}
              onToggleProduct={toggleProduct}
              onToggleOption={toggleOption}
              saving={saving}
            />
          );
        })}
      </div>
    </div>
  );
}

// Como o endpoint de disponibilidade retorna só o que ESTÁ disponível,
// buscamos a lista completa de produtos/opções em paralelo para saber
// o que existe no cadastro e poder reativar o que foi desativado.
function ProductAvailabilityBlock({ slug, product, date, onToggleProduct, onToggleOption, saving }) {
  const [allProducts, setAllProducts] = useState([]);

  useEffect(() => {
    api.adminProducts().then(setAllProducts).catch(() => {});
  }, [date]);

  const full = allProducts.find((p) => p.slug === slug);
  if (!full) return null;

  const productAvailable = !!product;

  return (
    <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="product-title">{full.name}</div>
        <div
          className={`option-pill ${productAvailable ? 'selected' : ''}`}
          style={{ cursor: saving ? 'wait' : 'pointer' }}
          onClick={() => !saving && onToggleProduct(full)}
        >
          {productAvailable ? 'Disponível hoje' : 'Indisponível hoje'}
        </div>
      </div>

      {full.requires_option && (
        <div className="option-group" style={{ marginTop: 10 }}>
          {full.options
            .filter((o) => o.active)
            .map((opt) => {
              const optionAvailable = product ? product.options.some((o) => o.id === opt.id) : false;
              return (
                <div
                  key={opt.id}
                  className={`option-pill ${optionAvailable ? 'selected' : ''}`}
                  style={{
                    cursor: saving ? 'wait' : 'pointer',
                    ...(optionAvailable
                      ? {}
                      : { opacity: 0.55, border: '2px dashed var(--red-danger)', textDecoration: 'line-through' }),
                  }}
                  onClick={() => !saving && onToggleOption(full, opt, optionAvailable)}
                >
                  {opt.label}
                  <span style={{ fontWeight: 400, opacity: 0.85 }}>
                    {' '}
                    {optionAvailable ? '· disponível' : '· indisponível'}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

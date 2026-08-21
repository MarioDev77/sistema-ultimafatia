'use client';

import { useEffect, useState } from 'react';
import { api, formatCents } from '../lib/api';

// Turmas disponíveis — mantenha sincronizada com VALID_CLASS_NAMES no backend
// (backend/src/utils/validators.js).
const CLASS_OPTIONS = [
  '1 Finanças',
  '2 Finanças',
  '1 ADM',
  '2 ADM',
  '3 ADM',
  '1A',
  '1B',
  '1C',
  '1D',
  'Não aluno / Funcionário',
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function Home() {
  const [step, setStep] = useState(1); // 1 cardápio, 2 dados, 3 resumo, 4 pagamento
  const [pickupDate, setPickupDate] = useState(tomorrowISO());
  const [menu, setMenu] = useState([]);
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [cart, setCart] = useState({}); // key: `${productId}:${optionId}` -> {product, option, qty}
  const [studentName, setStudentName] = useState('');
  const [className, setClassName] = useState(CLASS_OPTIONS[0]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState(null);
  const [apiError, setApiError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoadingMenu(true);
    api
      .getMenu(pickupDate)
      .then((data) => {
        setMenu(data.menu);
        setOrdersOpen(data.ordersOpen);
        setCart({});
      })
      .catch((err) => setApiError(err.message))
      .finally(() => setLoadingMenu(false));
  }, [pickupDate]);

  // Sanduíche não tem sabor pra escolher — um único botão "Comprar" que
  // liga/desliga 1 unidade no carrinho (toque de novo pra remover).
  function toggleSimpleProduct(product) {
    const key = `${product.id}:null`;
    setCart((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = { product, option: null, qty: 1 };
      }
      return next;
    });
  }

  function selectOption(product, option) {
    // Tocar num sabor seleciona ele (e troca qualquer sabor já escolhido
    // desse produto); tocar de novo no mesmo sabor já selecionado remove
    // do carrinho — um único toque faz a "compra", sem contador.
    setCart((prev) => {
      const key = `${product.id}:${option.id}`;
      const alreadySelected = !!prev[key];
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`${product.id}:`)) delete next[k];
      });
      if (!alreadySelected) {
        next[key] = { product, option, qty: 1 };
      }
      return next;
    });
  }

  const cartItems = Object.values(cart);
  const cartTotalCents = cartItems.reduce(
    (sum, item) => sum + (item.product.price_cents + (item.option?.extra_price_cents || 0)) * item.qty,
    0
  );
  const cartCount = cartItems.reduce((sum, item) => sum + item.qty, 0);

  function goToStep2() {
    if (cartCount === 0) return;
    setStep(2);
  }

  function validateStep2() {
    if (studentName.trim().length < 2) return 'Digite seu nome completo.';
    if (!CLASS_OPTIONS.includes(className)) return 'Selecione sua turma.';
    return '';
  }

  async function confirmAndPay() {
    setSubmitting(true);
    setApiError('');
    try {
      const items = cartItems.map((item) => ({
        product_id: item.product.id,
        option_id: item.option ? item.option.id : null,
        quantity: item.qty,
      }));
      const result = await api.createOrder({
        student_name: studentName.trim(),
        class_name: className.trim(),
        pickup_date: pickupDate,
        items,
      });
      setOrder(result);
      setStep(4);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyPix() {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.pix.payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard pode falhar em contexto não seguro; ignora silenciosamente
    }
  }

  function handleSendProofWhatsapp() {
    if (!order) return;
    const linha = (label, value) => `${label}: ${value}`;
    const mensagem = [
      'Olá! Segue o comprovante do meu pedido na Última Fatia.',
      linha('Pedido nº', order.order_number),
      linha('Nome', studentName),
      linha('Turma', className),
      linha('Retirada', pickupDate.split('-').reverse().join('/')),
      linha('Total', formatCents(order.total_amount_cents)),
      '',
      '(anexe o comprovante aqui)',
    ].join('\n');
    const numeroWhatsapp = '5575998236927';
    const url = `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
  }

  return (
    <div className="container">
      <div className="header">
        <div className="logo-badge">🥪</div>
        <div>
          <div className="title">Última Fatia</div>
          <div className="subtitle">Sanduíches naturais &amp; cones trufados</div>
        </div>
      </div>

      <div className="steps">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`step-dot ${step >= s ? 'active' : ''}`} />
        ))}
      </div>

      {apiError && <div className="error-text">{apiError}</div>}

      {step === 1 && (
        <>
          <div className="card">
            <label className="label">Data de retirada</label>
            <input
              type="date"
              className="input"
              value={pickupDate}
              min={todayISO()}
              onChange={(e) => setPickupDate(e.target.value)}
              style={{ marginBottom: 0 }}
            />
          </div>

          {!ordersOpen && (
            <div className="card">
              <div className="error-text">Não há pedidos abertos para esta data. Escolha outro dia.</div>
            </div>
          )}

          {loadingMenu && <div className="card">Carregando cardápio...</div>}

          {!loadingMenu &&
            ordersOpen &&
            menu.map((product) => (
              <div key={product.id} className="card product-card">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="product-title">{product.name}</div>
                  <div className="product-price">{formatCents(product.price_cents)}</div>
                </div>
                <div className="product-desc">{product.description}</div>

                {product.requires_option && (
                  <div className="option-group">
                    {product.options.length === 0 && (
                      <span className="error-text">Nenhuma opção disponível hoje.</span>
                    )}
                    {product.options.map((opt) => {
                      const key = `${product.id}:${opt.id}`;
                      const selected = !!cart[key];
                      return (
                        <div
                          key={opt.id}
                          className={`option-pill ${selected ? 'selected' : ''}`}
                          onClick={() => selectOption(product, opt)}
                        >
                          {selected ? '✓ ' : ''}
                          {opt.label}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!product.requires_option && (
                  <button
                    className={cart[`${product.id}:null`] ? 'btn-secondary' : 'btn-primary'}
                    style={{ marginTop: 12 }}
                    onClick={() => toggleSimpleProduct(product)}
                  >
                    {cart[`${product.id}:null`] ? '✓ Adicionado — toque para remover' : 'Comprar'}
                  </button>
                )}
              </div>
            ))}

          {cartCount > 0 && (
            <div className="footer-bar">
              <div className="total-row">
                <span>{cartCount} item(ns)</span>
                <span>{formatCents(cartTotalCents)}</span>
              </div>
              <button className="btn-primary" style={{ marginTop: 10 }} onClick={goToStep2}>
                Continuar
              </button>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <div className="card">
            <label className="label">Nome completo</label>
            <input
              className="input"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Seu nome completo"
              maxLength={120}
            />
            <label className="label">Turma</label>
            <select
              className="input"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              style={{ marginBottom: 0 }}
            >
              {CLASS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          {formError && <div className="error-text">{formError}</div>}
          <button
            className="btn-primary"
            onClick={() => {
              const err = validateStep2();
              if (err) return setFormError(err);
              setFormError('');
              setStep(3);
            }}
          >
            Ver resumo do pedido
          </button>
          <div style={{ height: 10 }} />
          <button className="btn-secondary" onClick={() => setStep(1)}>
            Voltar ao cardápio
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <div className="card">
            <div className="product-title" style={{ marginBottom: 8 }}>
              Resumo do pedido
            </div>
            <div className="summary-row">
              <span>Nome</span>
              <span>{studentName}</span>
            </div>
            <div className="summary-row">
              <span>Turma</span>
              <span>{className}</span>
            </div>
            <div className="summary-row">
              <span>Retirada</span>
              <span>{pickupDate.split('-').reverse().join('/')}</span>
            </div>
            <div className="summary-row">
              <span>Horário</span>
              <span>09:40 às 10:00</span>
            </div>
          </div>

          <div className="card">
            {cartItems.map((item, idx) => (
              <div className="summary-row" key={idx}>
                <span>
                  {item.qty}x {item.product.name}
                  {item.option ? ` (${item.option.label})` : ''}
                </span>
                <span>
                  {formatCents((item.product.price_cents + (item.option?.extra_price_cents || 0)) * item.qty)}
                </span>
              </div>
            ))}
            <div className="total-row">
              <span>Total</span>
              <span>{formatCents(cartTotalCents)}</span>
            </div>
          </div>

          <button className="btn-primary" disabled={submitting} onClick={confirmAndPay}>
            {submitting ? 'Gerando Pix...' : 'Confirmar e gerar Pix'}
          </button>
          <div style={{ height: 10 }} />
          <button className="btn-secondary" onClick={() => setStep(2)}>
            Voltar
          </button>
        </>
      )}

      {step === 4 && order && (
        <>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="subtitle">Pedido nº</div>
            <div className="title" style={{ fontSize: 24 }}>
              {order.order_number}
            </div>
          </div>

          <div className="card" style={{ textAlign: 'center' }}>
            <div className="product-title">Pague seu pedido</div>
            <div className="product-price" style={{ fontSize: 22, margin: '8px 0' }}>
              {formatCents(order.total_amount_cents)}
            </div>
            <div className="qr-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={order.pix.qr_code_data_url} alt="QR Code Pix" width={220} height={220} />
            </div>
            <div className="pix-code-box">{order.pix.payload}</div>
            <button className="btn-primary" onClick={handleCopyPix}>
              {copied ? 'Copiado!' : 'COPIAR PIX'}
            </button>
          </div>

          <div className="card" style={{ textAlign: 'center' }}>
            <div className="product-title" style={{ marginBottom: 4 }}>
              Pague pelo QR Code ou copia e cola acima
            </div>
            <div className="subtitle">
              Assim que o pagamento cair, um responsável confirma seu pedido. Você também pode
              acelerar a confirmação enviando o comprovante direto pelo WhatsApp abaixo.
            </div>
          </div>

          <div className="card" style={{ textAlign: 'center' }}>
            <div className="product-title" style={{ marginBottom: 4 }}>
              Finalizar compra enviando comprovante
            </div>
            <div className="subtitle" style={{ marginBottom: 12 }}>
              Toque no botão, anexe o print ou foto do comprovante do Pix e envie a mensagem.
            </div>
            <button className="btn-whatsapp" onClick={handleSendProofWhatsapp}>
              <svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.29.638 4.43 1.744 6.257L4 29l7.94-1.706A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm0 21.727c-1.99 0-3.845-.58-5.405-1.578l-.388-.242-4.71 1.012 1.03-4.59-.253-.397A9.66 9.66 0 0 1 5.273 15c0-5.912 4.812-10.727 10.73-10.727S26.727 9.088 26.727 15 21.918 24.727 16.004 24.727Zm5.902-8.03c-.324-.163-1.915-.945-2.212-1.053-.297-.108-.513-.163-.729.163-.216.325-.837 1.053-1.026 1.27-.189.216-.378.244-.702.081-.324-.163-1.367-.504-2.605-1.607-.963-.859-1.614-1.92-1.803-2.244-.189-.325-.02-.5.143-.663.146-.146.324-.379.486-.568.163-.19.216-.325.324-.541.108-.216.054-.406-.027-.569-.081-.163-.729-1.758-.999-2.408-.263-.633-.53-.547-.729-.557l-.621-.011c-.216 0-.568.081-.865.406-.297.325-1.135 1.108-1.135 2.703 0 1.595 1.162 3.136 1.324 3.352.163.216 2.288 3.494 5.543 4.9.775.334 1.379.534 1.85.684.777.247 1.484.212 2.043.129.623-.093 1.915-.783 2.185-1.539.27-.756.27-1.404.19-1.539-.081-.135-.297-.216-.621-.379Z" />
              </svg>
              Enviar comprovante no WhatsApp
            </button>
          </div>

          <div className="card">
            <div className="subtitle">
              Guarde este link para acompanhar seu pedido:
            </div>
            <div className="pix-code-box" style={{ marginTop: 8 }}>
              {typeof window !== 'undefined' ? `${window.location.origin}/pedido/${order.access_token}` : ''}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


'use client';

import { useEffect, useState } from 'react';
import { api, formatCents } from '../lib/api';

// Turmas disponíveis — mantenha sincronizada com VALID_CLASS_NAMES no backend
// (backend/src/utils/validators.js).
const CLASS_OPTIONS = ['1 Finanças', '2 Finanças', '1 ADM', '2 ADM', '3 ADM'];

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
  const [proofMode, setProofMode] = useState('upload'); // 'upload' | 'link'
  const [proofFile, setProofFile] = useState(null);
  const [proofUrl, setProofUrl] = useState('');
  const [proofError, setProofError] = useState('');
  const [sendingProof, setSendingProof] = useState(false);
  const [proofSent, setProofSent] = useState(false);

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

  function updateCartQty(product, option, delta) {
    const key = `${product.id}:${option ? option.id : 'null'}`;
    setCart((prev) => {
      const current = prev[key]?.qty || 0;
      const nextQty = Math.max(0, current + delta);
      const next = { ...prev };
      if (nextQty === 0) {
        delete next[key];
      } else {
        next[key] = { product, option, qty: nextQty };
      }
      return next;
    });
  }

  function selectOption(product, option) {
    // Ao trocar de sabor/opção, some com a quantidade da opção anterior daquele produto
    // e começa a nova opção com 1 unidade (comportamento simples e previsível no celular).
    setCart((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${product.id}:`)) delete next[key];
      });
      next[`${product.id}:${option.id}`] = { product, option, qty: 1 };
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

  async function handleSendProof() {
    if (!order) return;
    setProofError('');

    if (proofMode === 'upload') {
      if (!proofFile) {
        setProofError('Selecione a foto ou print do comprovante.');
        return;
      }
      setSendingProof(true);
      try {
        await api.sendPaymentProofFile(order.access_token, proofFile);
        setProofSent(true);
      } catch (err) {
        setProofError(err.message);
      } finally {
        setSendingProof(false);
      }
    } else {
      const trimmed = proofUrl.trim();
      if (!trimmed) {
        setProofError('Cole o link do comprovante.');
        return;
      }
      setSendingProof(true);
      try {
        await api.sendPaymentProofLink(order.access_token, trimmed);
        setProofSent(true);
      } catch (err) {
        setProofError(err.message);
      } finally {
        setSendingProof(false);
      }
    }
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
                          {opt.label}
                        </div>
                      );
                    })}
                  </div>
                )}

                {Object.entries(cart)
                  .filter(([key]) => key.startsWith(`${product.id}:`))
                  .map(([key, item]) => (
                    <div className="qty-row" key={key}>
                      <button className="qty-btn" onClick={() => updateCartQty(item.product, item.option, -1)}>
                        −
                      </button>
                      <span className="qty-value">{item.qty}</span>
                      <button className="qty-btn" onClick={() => updateCartQty(item.product, item.option, 1)}>
                        +
                      </button>
                      <span className="subtitle">
                        {item.option ? item.option.label : 'unidade(s)'}
                      </span>
                    </div>
                  ))}

                {!product.requires_option && (
                  <div className="qty-row">
                    <button className="qty-btn" onClick={() => updateCartQty(product, null, -1)}>
                      −
                    </button>
                    <span className="qty-value">{cart[`${product.id}:null`]?.qty || 0}</span>
                    <button className="qty-btn" onClick={() => updateCartQty(product, null, 1)}>
                      +
                    </button>
                  </div>
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

          <div className="card">
            {proofSent ? (
              <div style={{ textAlign: 'center' }}>
                <div className="product-title">Comprovante recebido! ✅</div>
                <div className="subtitle" style={{ marginTop: 6 }}>
                  Vamos conferir seu comprovante e confirmar o pagamento em breve. Acompanhe o status
                  do pedido pelo link abaixo.
                </div>
              </div>
            ) : (
              <>
                <div className="product-title" style={{ marginBottom: 4 }}>
                  Envie o comprovante do pagamento
                </div>
                <div className="subtitle" style={{ marginBottom: 12 }}>
                  Depois de pagar o Pix acima, envie o comprovante aqui — foto/print da tela do banco
                  ou o link do comprovante. Um responsável vai conferir e confirmar seu pagamento.
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    type="button"
                    className={proofMode === 'upload' ? 'btn-primary' : 'btn-secondary'}
                    style={{ flex: 1 }}
                    onClick={() => setProofMode('upload')}
                  >
                    Enviar foto
                  </button>
                  <button
                    type="button"
                    className={proofMode === 'link' ? 'btn-primary' : 'btn-secondary'}
                    style={{ flex: 1 }}
                    onClick={() => setProofMode('link')}
                  >
                    Colar link
                  </button>
                </div>

                {proofMode === 'upload' ? (
                  <PhotoProofPicker file={proofFile} onFileSelected={setProofFile} />
                ) : (
                  <input
                    className="input"
                    type="url"
                    placeholder="https://..."
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                  />
                )}

                {proofError && <div className="error-text">{proofError}</div>}

                <button
                  className="btn-primary"
                  style={{ marginTop: 10 }}
                  disabled={sendingProof}
                  onClick={handleSendProof}
                >
                  {sendingProof ? 'Enviando...' : 'Enviar comprovante'}
                </button>
              </>
            )}
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

// Dá duas formas claras de escolher o comprovante no celular: tirar uma
// foto na hora (abre a câmera direto) ou escolher da galeria/arquivos
// (ex.: um print que o aluno já tinha salvo). Antes só existia um único
// input com capture="environment", que em vários celulares tira a opção
// de escolher da galeria — obrigando a tirar foto na hora mesmo quando
// o comprovante já estava salvo como print.
function PhotoProofPicker({ file, onFileSelected }) {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <label className="btn-secondary" style={{ flex: 1, textAlign: 'center', display: 'block' }}>
          📷 Tirar foto agora
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => onFileSelected(e.target.files?.[0] || null)}
          />
        </label>
        <label className="btn-secondary" style={{ flex: 1, textAlign: 'center', display: 'block' }}>
          🖼️ Escolher da galeria
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => onFileSelected(e.target.files?.[0] || null)}
          />
        </label>
      </div>

      {file && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--cream-light)', borderRadius: 12, padding: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Prévia do comprovante" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
          <div style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
          <button type="button" onClick={() => onFileSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--red-danger)', fontWeight: 700, cursor: 'pointer' }}>
            remover
          </button>
        </div>
      )}
    </div>
  );
}

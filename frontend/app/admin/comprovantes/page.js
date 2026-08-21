'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatCents } from '../../../lib/api';
import { compressImageFile } from '../../../lib/imageCompress';
import AdminNav from '../../../components/AdminNav';


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
  const [captureFile, setCaptureFile] = useState(null); // foto tirada (já comprimida), aguardando confirmação
  const [capturePreviewUrl, setCapturePreviewUrl] = useState(null);
  const [captureError, setCaptureError] = useState('');
  const [captureSuccess, setCaptureSuccess] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [compressing, setCompressing] = useState(false);
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

  useEffect(() => {
    if (!captureFile) {
      setCapturePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(captureFile);
    setCapturePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [captureFile]);

  async function findOrderByNumber() {
    setCaptureError('');
    setCaptureSuccess('');
    setCaptureOrder(null);
    setCaptureFile(null);
    const num = orderNumberInput.trim();
    if (!num) return;
    try {
      // Busca direta pelo número (não depende da data de retirada do
      // pedido — antes buscava só nos pedidos com retirada hoje, e como o
      // padrão é retirada no dia seguinte, quase sempre dava "não
      // encontrado" mesmo com o pedido existindo).
      const found = await api.adminOrderByNumber(num);
      setCaptureOrder(found);
    } catch (err) {
      setCaptureError(err.message);
    }
  }

  async function handlePhotoSelected(file) {
    setCaptureSuccess('');
    setCaptureError('');
    if (!file) {
      setCaptureFile(null);
      return;
    }
    setCompressing(true);
    try {
      const compressed = await compressImageFile(file);
      setCaptureFile(compressed);
    } catch {
      setCaptureFile(file); // se a compressão falhar por algum motivo, usa a foto original
    } finally {
      setCompressing(false);
    }
  }

  async function handleSavePhoto() {
    if (!captureOrder || !captureFile) return;
    setCapturing(true);
    setCaptureError('');
    try {
      await api.adminCapturePaymentProof(captureOrder.id, captureFile);
      setCaptureSuccess(`Comprovante do pedido ${captureOrder.public_order_number} salvo com sucesso!`);
      setCaptureFile(null);
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
          Digite o número do pedido (ex: UF-284193), tire a foto do comprovante mostrado pelo aluno no balcão,
          confira a prévia e clique em Salvar.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            className="input"
            style={{ marginBottom: 0 }}
            placeholder="Número do pedido"
            value={orderNumberInput}
            onChange={(e) => setOrderNumberInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && findOrderByNumber()}
          />
          <button className="btn-secondary" style={{ width: 'auto', padding: '10px 16px' }} onClick={findOrderByNumber}>
            Buscar
          </button>
        </div>

        {captureError && <div className="error-text">{captureError}</div>}
        {captureSuccess && (
          <div style={{ color: 'var(--green-ok)', fontWeight: 700, marginBottom: 10 }}>✓ {captureSuccess}</div>
        )}

        {captureOrder && (
          <div style={{ background: 'var(--cream-light)', borderRadius: 12, padding: 10 }}>
            <div style={{ fontWeight: 700 }}>{captureOrder.student_name}</div>
            <div className="subtitle" style={{ marginBottom: 10 }}>
              {captureOrder.public_order_number} — {formatCents(captureOrder.total_amount_cents)}
            </div>

            {!captureFile ? (
              <label className="btn-primary" style={{ display: 'block', textAlign: 'center', cursor: compressing ? 'wait' : 'pointer' }}>
                {compressing ? 'Processando foto...' : '📷 Abrir câmera e tirar foto'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  disabled={compressing}
                  onChange={(e) => handlePhotoSelected(e.target.files?.[0] || null)}
                />
              </label>
            ) : (
              <div>
                <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 10, maxHeight: 260 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={capturePreviewUrl} alt="Prévia do comprovante" style={{ width: '100%', display: 'block', objectFit: 'contain' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn-primary"
                    style={{ flex: 1 }}
                    onClick={handleSavePhoto}
                    disabled={capturing}
                  >
                    {capturing ? 'Salvando...' : '💾 Salvar foto do comprovante'}
                  </button>
                  <label className="btn-secondary" style={{ width: 'auto', padding: '10px 16px', textAlign: 'center', cursor: 'pointer' }}>
                    Tirar outra
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={(e) => handlePhotoSelected(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>
            )}
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
              href={'/api/admin/orders/' + p.order_id + '/payment-proof/image'}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #eee', height: 110 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={'/api/admin/orders/' + p.order_id + '/payment-proof/image'}
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

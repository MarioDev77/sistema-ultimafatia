const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include', // envia cookie httpOnly de sessão admin quando existir
    headers: {
      // Com FormData o navegador define o Content-Type (com boundary) sozinho;
      // definir manualmente quebraria o upload do arquivo.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // resposta sem corpo
  }

  if (!res.ok) {
    const message = (data && data.error) || 'Ocorreu um erro. Tente novamente.';
    throw new Error(message);
  }
  return data;
}

export const api = {
  getMenu: (date) => request(`/api/menu?date=${encodeURIComponent(date)}`),
  createOrder: (payload) => request('/api/orders', { method: 'POST', body: JSON.stringify(payload) }),
  getOrder: (token) => request(`/api/orders/${encodeURIComponent(token)}`),
  notifyPayment: (token) => request(`/api/orders/${encodeURIComponent(token)}/notify-payment`, { method: 'POST' }),

  adminLogin: (username, password) =>
    request('/api/admin/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  adminLogout: () => request('/api/admin/auth/logout', { method: 'POST' }),
  adminMe: () => request('/api/admin/auth/me'),
  adminDashboard: (date) => request(`/api/admin/dashboard?date=${encodeURIComponent(date)}`),
  adminOrders: (date) => request(`/api/admin/orders?date=${encodeURIComponent(date)}`),
  adminOrderDetail: (id) => request(`/api/admin/orders/${id}`),
  adminUpdateOrderStatus: (id, status) =>
    request(`/api/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  adminAvailability: (date) => request(`/api/admin/availability?date=${encodeURIComponent(date)}`),
  adminSetAvailability: (payload) =>
    request('/api/admin/availability', { method: 'POST', body: JSON.stringify(payload) }),
  adminSetCalendar: (payload) => request('/api/admin/calendar', { method: 'POST', body: JSON.stringify(payload) }),
  adminProducts: () => request('/api/admin/products'),
  adminUpdateProduct: (id, payload) =>
    request(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  adminPayments: (from, to, onlyWithProof) =>
    request(
      `/api/admin/payments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${onlyWithProof ? '&only_with_proof=true' : ''}`
    ),
  adminPaymentProofImageUrl: (orderId) => `${API_URL}/api/admin/orders/${orderId}/payment-proof/image`,
  adminAnalyzeProof: (orderId) => request(`/api/admin/orders/${orderId}/payment-proof/analyze`, { method: 'POST' }),
  adminCapturePaymentProof: (orderId, file) => {
    const formData = new FormData();
    formData.append('comprovante', file);
    return request(`/api/admin/orders/${orderId}/payment-proof/capture`, { method: 'POST', body: formData });
  },
  adminPaymentProofs: (from, to) =>
    request(
      `/api/admin/payment-proofs?${from ? `from=${encodeURIComponent(from)}&` : ''}${to ? `to=${encodeURIComponent(to)}` : ''}`
    ),

  adminWeeklyReport: (date) => request(`/api/admin/reports/weekly?${date ? `date=${encodeURIComponent(date)}` : ''}`),
  adminWeeklyReportExcelUrl: (date) => `${API_URL}/api/admin/reports/weekly/excel${date ? `?date=${encodeURIComponent(date)}` : ''}`,
  adminWeeklyReportPdfUrl: (date) => `${API_URL}/api/admin/reports/weekly/pdf${date ? `?date=${encodeURIComponent(date)}` : ''}`,

  adminAssistantChat: (messages, includeTodayContext) =>
    request('/api/admin/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, include_today_context: includeTodayContext }),
    }),
};

export function formatCents(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

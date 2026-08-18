'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.adminLogin(username, password);
      router.push('/admin/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 60 }}>
      <div className="header" style={{ justifyContent: 'center' }}>
        <div className="logo-badge">🥪</div>
        <div>
          <div className="title">Última Fatia</div>
          <div className="subtitle">Painel administrativo</div>
        </div>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <label className="label">Usuário</label>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        <label className="label">Senha</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <div className="error-text">{error}</div>}
        <button className="btn-primary" disabled={loading} type="submit">
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

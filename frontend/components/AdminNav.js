'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '../lib/api';

const TABS = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/pedidos', label: 'Pedidos' },
  { href: '/admin/disponibilidade', label: 'Disponibilidade' },
  { href: '/admin/produtos', label: 'Produtos' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await api.adminLogout();
    } finally {
      router.push('/admin/login');
    }
  }

  return (
    <div className="nav-tabs">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={`nav-tab ${pathname === tab.href ? 'active' : ''}`}>
          {tab.label}
        </Link>
      ))}
      <button className="nav-tab" style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={handleLogout}>
        Sair
      </button>
    </div>
  );
}

/** @type {import('next').NextConfig} */

// URL do backend (Railway) usada só no servidor do Next.js pra fazer o
// proxy — nunca chega no navegador. Reaproveita a mesma variável de
// ambiente NEXT_PUBLIC_API_URL já configurada na Vercel.
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Faz o navegador falar sempre com o próprio domínio do frontend
  // (mesmo domínio da página), e o Next.js repassa a requisição pro
  // backend por trás dos panos. Isso resolve o login em loop no celular:
  // sem isso, o cookie de sessão do admin precisava ser "cross-site"
  // (SameSite=None) porque front e back ficam em domínios diferentes —
  // e vários navegadores mobile (Safari/iOS, navegadores dentro de apps
  // como Instagram) bloqueiam esse tipo de cookie por padrão, então o
  // login "funcionava" no back mas o cookie nunca ficava salvo no
  // celular. Com o proxy, o navegador só conversa com o domínio do
  // frontend, o cookie vira "same-site" de verdade e passa a funcionar
  // em qualquer navegador.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
};
module.exports = nextConfig;

import './globals.css';

export const metadata = {
  title: 'Última Fatia',
  description: 'Peça seu sanduíche natural ou cone trufado para o recreio.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

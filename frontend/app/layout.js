import './globals.css';

export const metadata = {
  title: 'Última Fatia',
  description: 'Peça seu sanduíche natural ou cone trufado para o recreio.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

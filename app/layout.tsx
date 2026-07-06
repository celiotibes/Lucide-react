import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'CRMT Gestão Imobiliária',
  description: 'Back-office de gestão de locação e temporada — Curitiba e Florianópolis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="layout">
          <aside className="barra-lateral">
            <h1>CRMT</h1>
            <nav>
              <Link href="/imoveis">Imóveis</Link>
              <Link href="/contratos">Contratos</Link>
              <Link href="/faturas">Faturas</Link>
            </nav>
          </aside>
          <main className="conteudo">{children}</main>
        </div>
      </body>
    </html>
  );
}

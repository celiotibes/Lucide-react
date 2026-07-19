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
              <Link href="/modelos-contrato">Modelos de Contrato</Link>
              <Link href="/faturas">Faturas</Link>
              <Link href="/ordens-servico">Ordens de Serviço</Link>
              <Link href="/quebras-contrato">Quebras de Contrato</Link>
              <Link href="/extratos">Extratos</Link>
              <Link href="/conciliacao-bancaria">Conciliação Bancária</Link>
              <Link href="/energia-solar">Energia Solar</Link>
              <Link href="/patrimonio">Patrimônio</Link>
              <Link href="/relatorios">Relatórios</Link>
              <Link href="/configuracoes">Configurações</Link>
            </nav>
          </aside>
          <main className="conteudo">{children}</main>
        </div>
      </body>
    </html>
  );
}

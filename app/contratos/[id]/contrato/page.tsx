import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PaginaContratoGerado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Contrato gerado</h2>
        <Link href="/contratos" className="botao-secundario">
          ← Voltar
        </Link>
      </div>
      <p className="section-hint">
        Renderização ao vivo de <code>gerarContratoHtml.ts</code> — funde o modelo regional ativo com os dados deste
        contrato. Ainda não vira PDF automaticamente (ver docs/27-motor-de-contratos.md).
      </p>
      <div className="previa-contrato">
        <iframe src={`/api/contratos/${id}/html`} title="Prévia do contrato gerado" />
      </div>
    </>
  );
}

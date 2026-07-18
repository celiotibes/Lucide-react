import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarData } from '@/lib/formatacao';
import AutovistoriaForm from '../../components/autovistoria/AutovistoriaForm';

interface Vistoria {
  id: string;
  imovel: string;
  contrato_id: string;
  data: string;
  modo: string;
}

async function buscarVistoria(id: string, token: string): Promise<Vistoria | null> {
  const pool = obterPool();

  // Validar token
  const link = await pool.query(
    `select * from magic_links where entity_id = $1 and token = $2 and expires_at > now()`,
    [id, token]
  );

  if (link.rows.length === 0) {
    return null; // Token inválido ou expirado
  }

  const vistoria = await pool.query<Vistoria>(
    `select v.id, v.imovel_id as imovel, v.contrato_id, v.data, v.modo
     from vistorias v
     where v.id = $1 and v.modo = 'autovistoria'`,
    [id]
  );

  return vistoria.rows[0] ?? null;
}

export default async function PaginaAutovistoria({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  if (!token) {
    redirect(`/autovistoria-acesso?vistoria=${id}`);
  }

  let vistoria: Vistoria | null;

  try {
    vistoria = await buscarVistoria(id, token);
  } catch (erro) {
    console.error('Erro ao buscar vistoria:', erro);
    vistoria = null;
  }

  if (!vistoria) {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        <h2>Acesso Expirado ou Inválido</h2>
        <p>
          O link de acesso para autovistoria expirou ou é inválido. Por favor, solicite um novo
          link ao gestor do imóvel.
        </p>
        <Link href="/" style={{ color: '#0066cc' }}>
          ← Voltar
        </Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>Autovistoria do Imóvel</h1>
          <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: '14px' }}>
            {vistoria.imovel} • {formatarData(vistoria.data)}
          </p>
          <p style={{ margin: 0, color: '#999', fontSize: '13px', lineHeight: '1.5' }}>
            Por favor, percorra cada cômodo do imóvel e registre o estado dos itens com fotos.
            <br />
            As fotos são <strong>obrigatórias</strong> para validar a inspeção.
          </p>
        </div>

        <AutovistoriaForm vistoriaId={vistoria.id} token={token} />
      </div>
    </div>
  );
}

import { createClient } from '@/lib/supabase/server';
import { obterPool } from '@/server/integracao/db';
import { PortalClient } from './PortalClient';

export const dynamic = 'force-dynamic';

interface ContratoInquilino {
  id: string;
  imovel_identificacao: string;
  data_inicio: string;
  data_fim: string | null;
  valor_aluguel: string;
  status: string;
}

async function buscarContratosInquilino(usuarioId: string): Promise<ContratoInquilino[]> {
  try {
    const pool = obterPool();

    // Busca contratos onde o usuário é locatário
    const { rows } = await pool.query<ContratoInquilino>(
      `select c.id, i.identificacao as imovel_identificacao,
              c.data_inicio, c.data_fim, c.valor_aluguel, c.status
       from contratos c
       join imoveis i on i.id = c.imovel_id
       join contrato_partes cp on cp.contrato_id = c.id
       where cp.papel = 'locatario_principal'
         and cp.pessoa_id = $1
       order by c.data_inicio desc`,
      [usuarioId]
    );

    return rows;
  } catch (erro) {
    console.error('Erro ao buscar contratos do inquilino:', erro);
    return [];
  }
}

export default async function PaginaPortalInquilino() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let contratos: ContratoInquilino[] = [];
  let erro: string | null = null;

  if (user) {
    try {
      contratos = await buscarContratosInquilino(user.id);
    } catch {
      erro = 'Erro ao carregar seus contratos';
    }
  }

  return <PortalClient contratos={contratos} erro={erro} />;
}

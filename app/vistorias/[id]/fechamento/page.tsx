import { useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { formatarMoeda } from '@/lib/formatacao';
import FechamentoForm from '../../../components/vistorias/FechamentoForm';

interface Vistoria {
  id: string;
  imovel: string;
  data: string;
  contrato_id: string;
}

async function buscarVistoria(id: string): Promise<Vistoria | null> {
  const pool = obterPool();
  const { rows } = await pool.query<Vistoria>(
    `select v.id, v.data, v.contrato_id, i.identificacao as imovel
     from vistorias v
     join imoveis i on i.id = v.imovel_id
     where v.id = $1 and v.tipo = 'saida'`,
    [id]
  );
  return rows[0] ?? null;
}

async function buscarFechamentoExistente(vistoriaSaidaId: string) {
  const pool = obterPool();
  const { rows } = await pool.query(
    `select fc.id, fc.total_debitos, fc.total_creditos, fc.saldo_final,
            array_agg(json_build_object(
              'descricao', if.descricao,
              'tipo', if.tipo,
              'origem', if.origem,
              'valor', if.valor
            )) as itens
     from fechamentos_contrato fc
     left join itens_fechamento if on if.fechamento_id = fc.id
     where fc.vistoria_saida_id = $1
     group by fc.id, fc.total_debitos, fc.total_creditos, fc.saldo_final`,
    [vistoriaSaidaId]
  );
  return rows[0] ?? null;
}

export default async function PaginaFechamento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let vistoria: Vistoria | null;

  try {
    vistoria = await buscarVistoria(id);
  } catch {
    return (
      <>
        <h2>Fechamento</h2>
        <p className="erro-conexao">Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).</p>
      </>
    );
  }

  if (!vistoria) {
    notFound();
  }

  const fechamentoExistente = await buscarFechamentoExistente(vistoria.id);

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Fechamento — {vistoria.imovel}</h2>
        <Link href={`/vistorias/${vistoria.id}`} className="botao-link">
          ← Voltar
        </Link>
      </div>

      <FechamentoForm vistoriaSaidaId={vistoria.id} fechamentoExistente={fechamentoExistente} />
    </>
  );
}

import Link from 'next/link';
import styles from './page.module.css';
import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarMoeda } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface ContratoDetalhes {
  id: string;
  imovel_identificacao: string;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
  valor_aluguel: string;
  dia_vencimento: number | null;
  indice_reajuste: string | null;
  status: string;
  locatario_nome: string | null;
}

async function buscarContrato(contratoId: string): Promise<ContratoDetalhes | null> {
  try {
    const pool = obterPool();
    const { rows } = await pool.query<ContratoDetalhes>(
      `select c.id, i.identificacao as imovel_identificacao, c.tipo,
              c.data_inicio, c.data_fim, c.valor_aluguel, c.dia_vencimento,
              c.indice_reajuste, c.status,
              p.nome as locatario_nome
       from contratos c
       join imoveis i on i.id = c.imovel_id
       left join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
       left join pessoas p on p.id = cp.pessoa_id
       where c.id = $1`,
      [contratoId]
    );

    return rows.length > 0 ? rows[0] : null;
  } catch (erro) {
    console.error('Erro ao buscar contrato:', erro);
    return null;
  }
}

export default async function PaginaDetalheContratoPortal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contrato = await buscarContrato(id);

  if (!contrato) {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Contrato não encontrado</h2>
          <Link href="/portal" className="botao-secundario">
            ← Voltar
          </Link>
        </div>
        <p className={styles["erro-conexao"]}>O contrato solicitado não foi encontrado.</p>
      </>
    );
  }

  const RUBRICA_TIPO: Record<string, string> = {
    locacao_padrao: 'Locação padrão',
    temporada: 'Temporada',
  };

  const RUBRICA_STATUS: Record<string, string> = {
    ativo: 'Ativo',
    aviso_previo: 'Aviso prévio',
    encerrado: 'Encerrado',
    extrajudicial: 'Extrajudicial',
    em_despejo: 'Em despejo',
  };

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Detalhes do Contrato</h2>
        <Link href="/portal" className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      <div className={styles["container-detalhes"]}>
        <div className={styles["card-secao"]}>
          <h3>Informações do Imóvel</h3>
          <div className={styles["info-grid"]}>
            <div className={styles["info-item"]}>
              <label>Identificação</label>
              <p>{contrato.imovel_identificacao}</p>
            </div>
            <div className={styles["info-item"]}>
              <label>Tipo de contrato</label>
              <p>{RUBRICA_TIPO[contrato.tipo] || contrato.tipo}</p>
            </div>
            <div className={styles["info-item"]}>
              <label>Status</label>
              <p>
                <span className={`${styles.tag} ${styles[`status-${contrato.status}`]}`}>
                  {RUBRICA_STATUS[contrato.status] || contrato.status}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className={styles["card-secao"]}>
          <h3>Termos Financeiros</h3>
          <div className={styles["info-grid"]}>
            <div className={styles["info-item"]}>
              <label>Aluguel mensal</label>
              <p className={styles["valor-grande"]}>{formatarMoeda(contrato.valor_aluguel)}</p>
            </div>
            <div className={styles["info-item"]}>
              <label>Dia de vencimento</label>
              <p>{contrato.dia_vencimento || '—'}</p>
            </div>
            <div className={styles["info-item"]}>
              <label>Índice de reajuste</label>
              <p>{contrato.indice_reajuste || 'Sem reajuste automático'}</p>
            </div>
          </div>
        </div>

        <div className={styles["card-secao"]}>
          <h3>Período de Vigência</h3>
          <div className={styles["info-grid"]}>
            <div className={styles["info-item"]}>
              <label>Início</label>
              <p>{formatarData(contrato.data_inicio)}</p>
            </div>
            <div className={styles["info-item"]}>
              <label>Término</label>
              <p>{contrato.data_fim ? formatarData(contrato.data_fim) : '(Sem data de término)'}</p>
            </div>
          </div>
        </div>

        <div className={styles["card-secao"]}>
          <h3>Dados do Locatário</h3>
          <div className={styles["info-grid"]}>
            <div className={styles["info-item"]}>
              <label>Nome</label>
              <p>{contrato.locatario_nome || '—'}</p>
            </div>
          </div>
        </div>

        <div className={styles["card-acoes"]}>
          <h3>Ações</h3>
          <div className={styles["grid-acoes"]}>
            <Link href={`/portal/contratos/${id}/pagamentos`} className="botao-acao">
              📋 Histórico de Pagamentos
            </Link>
            <Link href={`/portal/contratos/${id}/segunda-via`} className="botao-acao">
              📄 2ª Via de Boletos
            </Link>
            <Link href={`/portal/contratos/${id}/suporte`} className="botao-acao">
              💬 Entre em Contato
            </Link>
          </div>
        </div>

        <div className={styles["card-aviso"]}>
          <p>
            Para mais detalhes ou para solicitações relacionadas ao contrato, entre em contato com o proprietário ou gestor do imóvel.
          </p>
        </div>
      </div>

    </>
  );
}

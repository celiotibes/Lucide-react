import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarValor } from '@/lib/formatacao';
import Link from 'next/link';

interface KPI {
  titulo: string;
  valor: number | string;
  unidade?: string;
  cor: string;
  icone: string;
  tendencia?: 'up' | 'down' | 'stable';
}

interface ContestacaoUrgente {
  id: string;
  vistoria_saida_id: string;
  motivo: string;
  dias_uteis_restantes: number;
  status: string;
}

async function buscarKPIs() {
  const pool = obterPool();

  // Vistorias pendentes de processamento
  const vistoriasPendentes = await pool.query(
    `select count(*) as total from vistorias
     where modo = 'saida' and status in ('criada', 'em_execucao')`
  );

  // Contestações abertas
  const contestacoesAbertas = await pool.query(
    `select count(*) as total from contestacoes where status = 'aberta'`
  );

  // Contestações vencendo (≤3 dias úteis)
  const contestacoesVencendo = await pool.query(
    `select count(*) as total from contestacoes
     where status = 'aberta' and dias_uteis_restantes <= 3 and dias_uteis_restantes > 0`
  );

  // Preclusões expiradas
  const preclusoeExpiradas = await pool.query(
    `select count(*) as total from contestacoes where status = 'preclusao_expirada'`
  );

  // Reparos em execução
  const reparosEmExecucao = await pool.query(
    `select count(*) as total from reparos_vistoria where status = 'em_execucao'`
  );

  // Custos de reparos (total orçado)
  const custosReparos = await pool.query(
    `select coalesce(sum(orcamento_valor), 0) as total from reparos_vistoria
     where orcamento_valor is not null`
  );

  // Taxa média de divergência (danos encontrados / total de itens)
  const taxaDivergencia = await pool.query(
    `select
       coalesce(avg(divergencia_pct), 0) as taxa
     from (
       select
         count(case when estado = 'danificado' then 1 end)::float / nullif(count(*), 0) * 100 as divergencia_pct
       from itens_vistoria iv
       where exists (select 1 from vistorias v where v.id = iv.vistoria_id and v.modo = 'saida')
       group by iv.vistoria_id
     ) subq`
  );

  // Dias médios para encerrar contrato
  const diasParaEncerrar = await pool.query(
    `select
       coalesce(avg(extract(day from (updated_at - created_at))), 0) as dias
     from fechamentos_contrato
     where created_at > now() - interval '90 days'`
  );

  return {
    vistoriasPendentes: parseInt(vistoriasPendentes.rows[0].total),
    contestacoesAbertas: parseInt(contestacoesAbertas.rows[0].total),
    contestacoesVencendo: parseInt(contestacoesVencendo.rows[0].total),
    preclusoeExpiradas: parseInt(preclusoeExpiradas.rows[0].total),
    reparosEmExecucao: parseInt(reparosEmExecucao.rows[0].total),
    custosReparos: parseFloat(custosReparos.rows[0].total),
    taxaDivergencia: parseFloat(taxaDivergencia.rows[0].taxa),
    diasParaEncerrar: Math.round(parseFloat(diasParaEncerrar.rows[0].dias)),
  };
}

async function buscarContestacõesUrgentes() {
  const pool = obterPool();

  const result = await pool.query<ContestacaoUrgente>(
    `select c.id, c.vistoria_saida_id, c.motivo, c.dias_uteis_restantes, c.status
     from contestacoes c
     where c.status = 'aberta' and c.dias_uteis_restantes > 0
     order by c.dias_uteis_restantes asc
     limit 5`
  );

  return result.rows;
}

async function buscarReparosRecentes() {
  const pool = obterPool();

  const result = await pool.query(
    `select r.id, r.contestacao_id, r.status, r.orcamento_valor,
            c.motivo, r.updated_at
     from reparos_vistoria r
     join contestacoes c on c.id = r.contestacao_id
     where r.status in ('orcado', 'aprovado', 'agendado', 'em_execucao')
     order by r.updated_at desc
     limit 8`
  );

  return result.rows;
}

export default async function DashboardVistorias() {
  const kpis = await buscarKPIs();
  const contestaçõesUrgentes = await buscarContestacõesUrgentes();
  const reparosRecentes = await buscarReparosRecentes();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', padding: '20px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Cabeçalho */}
        <div style={{ marginBottom: '30px' }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px' }}>📊 Dashboard de Vistorias</h1>
          <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
            Acompanhamento em tempo real de contestações, reparos e métricas
          </p>
        </div>

        {/* KPIs Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '30px',
          }}
        >
          {/* Vistorias Pendentes */}
          <div
            style={{
              backgroundColor: '#fff3e0',
              borderRadius: '8px',
              padding: '20px',
              border: '1px solid #ffe0b2',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ margin: '0', color: '#e65100', fontSize: '12px', fontWeight: '600' }}>
                  Vistorias Pendentes
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '28px', fontWeight: '600', color: '#e65100' }}>
                  {kpis.vistoriasPendentes}
                </p>
              </div>
              <span style={{ fontSize: '32px' }}>📋</span>
            </div>
          </div>

          {/* Contestações Abertas */}
          <div
            style={{
              backgroundColor: '#e3f2fd',
              borderRadius: '8px',
              padding: '20px',
              border: '1px solid #bbdefb',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ margin: '0', color: '#1565c0', fontSize: '12px', fontWeight: '600' }}>
                  Contestações Abertas
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '28px', fontWeight: '600', color: '#1565c0' }}>
                  {kpis.contestacoesAbertas}
                </p>
              </div>
              <span style={{ fontSize: '32px' }}>⚖️</span>
            </div>
          </div>

          {/* Contestações Vencendo */}
          <div
            style={{
              backgroundColor: '#ffebee',
              borderRadius: '8px',
              padding: '20px',
              border: '1px solid #ffcdd2',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ margin: '0', color: '#c62828', fontSize: '12px', fontWeight: '600' }}>
                  Vencendo em ≤3 dias
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '28px', fontWeight: '600', color: '#c62828' }}>
                  {kpis.contestacoesVencendo}
                </p>
              </div>
              <span style={{ fontSize: '32px' }}>⏰</span>
            </div>
          </div>

          {/* Preclusões Expiradas */}
          <div
            style={{
              backgroundColor: '#f3e5f5',
              borderRadius: '8px',
              padding: '20px',
              border: '1px solid #e1bee7',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ margin: '0', color: '#7b1fa2', fontSize: '12px', fontWeight: '600' }}>
                  Preclusões Expiradas
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '28px', fontWeight: '600', color: '#7b1fa2' }}>
                  {kpis.preclusoeExpiradas}
                </p>
              </div>
              <span style={{ fontSize: '32px' }}>❌</span>
            </div>
          </div>

          {/* Reparos em Execução */}
          <div
            style={{
              backgroundColor: '#e8f5e9',
              borderRadius: '8px',
              padding: '20px',
              border: '1px solid #c8e6c9',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ margin: '0', color: '#2e7d32', fontSize: '12px', fontWeight: '600' }}>
                  Reparos em Execução
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '28px', fontWeight: '600', color: '#2e7d32' }}>
                  {kpis.reparosEmExecucao}
                </p>
              </div>
              <span style={{ fontSize: '32px' }}>🔧</span>
            </div>
          </div>

          {/* Custos de Reparos */}
          <div
            style={{
              backgroundColor: '#fce4ec',
              borderRadius: '8px',
              padding: '20px',
              border: '1px solid #f8bbd0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ margin: '0', color: '#c2185b', fontSize: '12px', fontWeight: '600' }}>
                  Custos Orçados
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '28px', fontWeight: '600', color: '#c2185b' }}>
                  {formatarValor(kpis.custosReparos)}
                </p>
              </div>
              <span style={{ fontSize: '32px' }}>💰</span>
            </div>
          </div>

          {/* Taxa de Divergência */}
          <div
            style={{
              backgroundColor: '#ede7f6',
              borderRadius: '8px',
              padding: '20px',
              border: '1px solid #ddd6f3',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ margin: '0', color: '#512da8', fontSize: '12px', fontWeight: '600' }}>
                  Taxa de Divergência
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '28px', fontWeight: '600', color: '#512da8' }}>
                  {kpis.taxaDivergencia.toFixed(1)}%
                </p>
              </div>
              <span style={{ fontSize: '32px' }}>📈</span>
            </div>
          </div>

          {/* Dias para Encerrar */}
          <div
            style={{
              backgroundColor: '#e0f2f1',
              borderRadius: '8px',
              padding: '20px',
              border: '1px solid #b2dfdb',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <p style={{ margin: '0', color: '#00695c', fontSize: '12px', fontWeight: '600' }}>
                  Dias Médios para Encerrar
                </p>
                <p style={{ margin: '8px 0 0 0', fontSize: '28px', fontWeight: '600', color: '#00695c' }}>
                  {kpis.diasParaEncerrar}
                </p>
              </div>
              <span style={{ fontSize: '32px' }}>📅</span>
            </div>
          </div>
        </div>

        {/* Seções de Detalhes */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginBottom: '20px',
          }}
        >
          {/* Contestações Urgentes */}
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '20px',
              border: '1px solid #ddd',
            }}
          >
            <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
              ⏰ Contestações Urgentes
            </h2>

            {contestaçõesUrgentes.length === 0 ? (
              <p style={{ margin: '0', color: '#999', fontSize: '14px' }}>Nenhuma contestação urgente</p>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {contestaçõesUrgentes.map((contestacao) => (
                  <Link
                    key={contestacao.id}
                    href={`/vistorias/${contestacao.vistoria_saida_id}/contestacao`}
                    style={{
                      padding: '12px',
                      backgroundColor:
                        contestacao.dias_uteis_restantes <= 1
                          ? '#ffebee'
                          : contestacao.dias_uteis_restantes <= 3
                            ? '#fff3e0'
                            : '#f5f5f5',
                      borderLeft: `4px solid ${contestacao.dias_uteis_restantes <= 1 ? '#f44336' : '#ff9800'}`,
                      borderRadius: '4px',
                      textDecoration: 'none',
                      color: 'inherit',
                      fontSize: '13px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.backgroundColor =
                        contestacao.dias_uteis_restantes <= 1 ? '#ffcdd2' : '#ffe0b2';
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.backgroundColor =
                        contestacao.dias_uteis_restantes <= 1
                          ? '#ffebee'
                          : contestacao.dias_uteis_restantes <= 3
                            ? '#fff3e0'
                            : '#f5f5f5';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>{contestacao.motivo}</p>
                        <p style={{ margin: '0', color: '#666', fontSize: '12px' }}>
                          ID: {contestacao.id.substring(0, 8)}...
                        </p>
                      </div>
                      <span
                        style={{
                          padding: '4px 8px',
                          backgroundColor:
                            contestacao.dias_uteis_restantes <= 1 ? '#f44336' : '#ff9800',
                          color: '#fff',
                          borderRadius: '3px',
                          fontSize: '12px',
                          fontWeight: '600',
                          whiteSpace: 'nowrap',
                          marginLeft: '8px',
                        }}
                      >
                        {contestacao.dias_uteis_restantes} dias
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Reparos Recentes */}
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '20px',
              border: '1px solid #ddd',
            }}
          >
            <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
              🔧 Reparos Recentes
            </h2>

            {reparosRecentes.length === 0 ? (
              <p style={{ margin: '0', color: '#999', fontSize: '14px' }}>Nenhum reparo recente</p>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {reparosRecentes.map((reparo: any) => (
                  <div
                    key={reparo.id}
                    style={{
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '4px',
                      fontSize: '13px',
                      border: '1px solid #eee',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: '0 0 4px 0', fontWeight: '600' }}>{reparo.motivo}</p>
                        <p style={{ margin: '0', color: '#666', fontSize: '12px' }}>
                          Status: <strong>{reparo.status}</strong>
                        </p>
                      </div>
                      <span style={{ color: '#999', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {reparo.orcamento_valor ? formatarValor(reparo.orcamento_valor) : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé com Informações */}
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            padding: '16px',
            fontSize: '12px',
            color: '#999',
            textAlign: 'center',
            border: '1px solid #ddd',
          }}
        >
          <p style={{ margin: '0' }}>
            Dashboard atualizado em tempo real. Última atualização: {new Date().toLocaleTimeString('pt-BR')}
          </p>
        </div>
      </div>
    </div>
  );
}

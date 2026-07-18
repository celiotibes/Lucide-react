import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { registrarContestacao, avaliarContestacao } from '@/app/actions/vistorias/gerenciarContestacao';
import { formatarData } from '@/lib/formatacao';

interface ItemVistoria {
  id: string;
  descricao: string;
  estado: string;
  observacoes?: string;
}

interface Vistoria {
  id: string;
  imovel: string;
  data: string;
  itens: ItemVistoria[];
  contrato_id: string;
}

interface Contestacao {
  id: string;
  status: string;
  motivo: string;
  descricaoDesacordo: string;
  dataAbertura: string;
  preclusaoLimite: string;
  diasUteisRestantes: number;
  statusReparo?: string;
}

async function buscarVistoria(id: string): Promise<Vistoria | null> {
  const pool = obterPool();

  const vistoriaResult = await pool.query(
    `select v.id, i.identificacao as imovel, v.data, v.contrato_id
     from vistorias v
     join imoveis i on i.id = v.imovel_id
     where v.id = $1 and v.modo = 'saida'`,
    [id]
  );

  if (vistoriaResult.rows.length === 0) {
    return null;
  }

  const vistoria = vistoriaResult.rows[0];

  // Buscar itens
  const itensResult = await pool.query(
    `select id, descricao, estado, observacoes from itens_vistoria where vistoria_id = $1`,
    [id]
  );

  return {
    id: vistoria.id,
    imovel: vistoria.imovel,
    data: vistoria.data,
    contrato_id: vistoria.contrato_id,
    itens: itensResult.rows,
  };
}

async function buscarContestacões(vistoriaId: string): Promise<Contestacao[]> {
  const pool = obterPool();

  const result = await pool.query(
    `select id, status, motivo, descricao_desacordo, data_abertura,
            preclusao_data_limite, dias_uteis_restantes, status_reparo
     from contestacoes
     where vistoria_saida_id = $1
     order by data_abertura desc`,
    [vistoriaId]
  );

  return result.rows.map((r) => ({
    id: r.id,
    status: r.status,
    motivo: r.motivo,
    descricaoDesacordo: r.descricao_desacordo,
    dataAbertura: r.data_abertura,
    preclusaoLimite: r.preclusao_data_limite,
    diasUteisRestantes: r.dias_uteis_restantes,
    statusReparo: r.status_reparo,
  }));
}

function getStatusBadge(status: string) {
  const statusMap: Record<string, { cor: string; label: string }> = {
    aberta: { cor: '#ff9800', label: '⏱️ Aberta' },
    aceita: { cor: '#4caf50', label: '✓ Aceita' },
    rejeitada: { cor: '#f44336', label: '✗ Rejeitada' },
    preclusao_expirada: { cor: '#9c27b0', label: '⏰ Preclusão expirada' },
  };

  const info = statusMap[status] || { cor: '#999', label: status };

  return (
    <span
      style={{
        backgroundColor: info.cor,
        color: '#fff',
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '600',
      }}
    >
      {info.label}
    </span>
  );
}

export default async function PaginaContestacao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const vistoria = await buscarVistoria(id);
  if (!vistoria) {
    notFound();
  }

  const contestacoes = await buscarContestacões(id);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
        {/* Cabeçalho */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>Portal de Contestação</h1>
              <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: '14px' }}>
                {vistoria.imovel} • Vistoria de saída em {formatarData(vistoria.data)}
              </p>
              <p style={{ margin: '0', color: '#999', fontSize: '13px' }}>
                Conforme Lei 8.245/91 (Lei do Inquilinato), você tem <strong>5 dias úteis</strong> para
                contestar itens cobráveis.
              </p>
            </div>
            <Link
              href={`/vistorias/${id}`}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f0f0f0',
                color: '#666',
                textDecoration: 'none',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            >
              ← Voltar
            </Link>
          </div>
        </div>

        {/* Itens para Contestar */}
        {vistoria.itens.length > 0 && (
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Itens da Vistoria</h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              {vistoria.itens.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '12px',
                    border: '1px solid #eee',
                    borderRadius: '4px',
                    backgroundColor: item.estado === 'danificado' ? '#fff3e0' : '#f9f9f9',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: '0 0 4px 0', fontWeight: '600', fontSize: '14px' }}>
                        {item.descricao}
                      </p>
                      <p style={{ margin: '0 0 4px 0', color: '#666', fontSize: '13px' }}>
                        Estado: <strong>{item.estado}</strong>
                      </p>
                      {item.observacoes && (
                        <p style={{ margin: '0', color: '#999', fontSize: '12px' }}>
                          Obs: {item.observacoes}
                        </p>
                      )}
                    </div>
                    {item.estado === 'danificado' && (
                      <Link
                        href={`/vistorias/${id}/contestacao/novo?item=${item.id}`}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#ff9800',
                          color: '#fff',
                          textDecoration: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          whiteSpace: 'nowrap',
                          marginLeft: '12px',
                        }}
                      >
                        Contestar
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contestações Registradas */}
        {contestacoes.length > 0 && (
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Suas Contestações</h2>

            <div style={{ display: 'grid', gap: '16px' }}>
              {contestacoes.map((contestacao) => (
                <div
                  key={contestacao.id}
                  style={{
                    padding: '16px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: '#fafafa',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div>
                      <p style={{ margin: '0 0 4px 0', fontWeight: '600', fontSize: '14px' }}>
                        {contestacao.motivo}
                      </p>
                      <p style={{ margin: '0 0 8px 0', color: '#666', fontSize: '12px' }}>
                        Aberta em {formatarData(contestacao.dataAbertura)}
                      </p>
                    </div>
                    {getStatusBadge(contestacao.status)}
                  </div>

                  <p style={{ margin: '0 0 12px 0', color: '#555', fontSize: '13px', lineHeight: '1.5' }}>
                    {contestacao.descricaoDesacordo}
                  </p>

                  {contestacao.status === 'aberta' && contestacao.diasUteisRestantes !== null && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor:
                          contestacao.diasUteisRestantes <= 1 ? '#ffebee' : '#fff3e0',
                        borderLeft: `3px solid ${contestacao.diasUteisRestantes <= 1 ? '#f44336' : '#ff9800'}`,
                        fontSize: '12px',
                        color: '#333',
                        marginBottom: '12px',
                      }}
                    >
                      ⏰ <strong>{contestacao.diasUteisRestantes} dias úteis restantes</strong> para a preclusão (Lei
                      8.245/91)
                    </div>
                  )}

                  {contestacao.statusReparo && (
                    <div style={{ padding: '8px 12px', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
                      <p style={{ margin: '0 0 4px 0', fontWeight: '600', fontSize: '12px', color: '#2e7d32' }}>
                        Status do Reparo
                      </p>
                      <p style={{ margin: '0', fontSize: '12px', color: '#558b2f' }}>
                        {contestacao.statusReparo.replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {contestacoes.length === 0 && (
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px' }}>
            <p style={{ margin: '0', color: '#666', textAlign: 'center' }}>
              Nenhuma contestação registrada. Selecione um item danificado acima para contestar.
            </p>
          </div>
        )}

        {/* Informações Legais */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginTop: '20px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>Informações Legais</h3>
          <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '12px', color: '#666', lineHeight: '1.6' }}>
            <li>Prazo: 5 dias úteis contados da notificação (Lei 8.245/91, Art. 23)</li>
            <li>Ausência de contestação: presunção de veracidade dos danos</li>
            <li>Documentação: toda contestação deve ser documentada com fotos/evidências</li>
            <li>Reparos: após aceita, será iniciado processo de orçamento e execução</li>
            <li>Conferência: nova vistoria será agendada após conclusão dos reparos</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

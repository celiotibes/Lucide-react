import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { criarDocumentoAssinatura, verificarStatusAssinatura } from '@/app/actions/vistorias/gerenciarAssinatura';
import { formatarData } from '@/lib/formatacao';

interface AssinatureData {
  id: string;
  vistoriaId: string;
  documentoZapsignUuid: string;
  status: string;
  linkAssinatura: string | null;
  dataCriacao: string;
  dataAssinatura?: string;
  signatarios: Array<{
    nome: string;
    email: string;
    status: string;
  }>;
}

interface VistoriaData {
  id: string;
  imovel: string;
  contrato_id: string;
  data: string;
  vistoriador_id: string;
  vistoriador_nome: string;
}

async function buscarVistoria(id: string): Promise<VistoriaData | null> {
  const pool = obterPool();

  const result = await pool.query<VistoriaData>(
    `select v.id, i.identificacao as imovel, v.contrato_id, v.data,
            v.vistoriador_id, p.nome as vistoriador_nome
     from vistorias v
     join imoveis i on i.id = v.imovel_id
     join pessoas p on p.id = v.vistoriador_id
     where v.id = $1 and v.modo = 'saida'`,
    [id]
  );

  return result.rows[0] ?? null;
}

async function buscarAssinatura(vistoriaId: string): Promise<AssinatureData | null> {
  const pool = obterPool();

  const result = await pool.query(
    `select id, vistoria_id as "vistoriaId", documento_zapsign_uuid as "documentoZapsignUuid",
            status, link_assinatura_vistoriador as "linkAssinatura",
            criado_em as "dataCriacao", data_conclusao as "dataAssinatura"
     from assinaturas_vistoria
     where vistoria_id = $1
     order by criado_em desc
     limit 1`,
    [vistoriaId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

function getStatusBadge(status: string) {
  const statusMap: Record<string, { cor: string; label: string }> = {
    criado: { cor: '#999', label: 'Criado' },
    enviado: { cor: '#0066cc', label: 'Enviado' },
    aberto_por_vistoriador: { cor: '#0066cc', label: 'Aberto (Vistoriador)' },
    assinado_por_vistoriador: { cor: '#00cc00', label: 'Assinado (Vistoriador)' },
    aberto_por_inquilino: { cor: '#0066cc', label: 'Aberto (Inquilino)' },
    assinado_por_inquilino: { cor: '#00cc00', label: 'Assinado (Inquilino)' },
    completado: { cor: '#00cc00', label: 'Completado' },
    cancelado: { cor: '#cc0000', label: 'Cancelado' },
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

export default async function PaginaAssinatura({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const vistoria = await buscarVistoria(id);
  if (!vistoria) {
    notFound();
  }

  const assinatura = await buscarAssinatura(id);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
        {/* Cabeçalho */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>Assinatura Eletrônica</h1>
              <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: '14px' }}>
                {vistoria.imovel} • {formatarData(vistoria.data)}
              </p>
              <p style={{ margin: '0 0 8px 0', color: '#999', fontSize: '13px' }}>
                Vistoriador: {vistoria.vistoriador_nome}
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

        {/* Status Atual */}
        {assinatura ? (
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Status da Assinatura</h2>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <p style={{ margin: 0, color: '#999', fontSize: '12px', marginBottom: '4px' }}>Status Atual</p>
                <div>{getStatusBadge(assinatura.status)}</div>
              </div>
              <div>
                <p style={{ margin: 0, color: '#999', fontSize: '12px', marginBottom: '4px' }}>Data de Criação</p>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
                  {formatarData(assinatura.dataCriacao)}
                </p>
              </div>
              {assinatura.dataAssinatura && (
                <div>
                  <p style={{ margin: 0, color: '#999', fontSize: '12px', marginBottom: '4px' }}>Data de Conclusão</p>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
                    {formatarData(assinatura.dataAssinatura)}
                  </p>
                </div>
              )}
            </div>

            {assinatura.status === 'enviado' && (
              <div
                style={{
                  backgroundColor: '#f0f8ff',
                  padding: '16px',
                  borderRadius: '4px',
                  borderLeft: '4px solid #0066cc',
                  marginBottom: '20px',
                }}
              >
                <p style={{ margin: '0 0 8px 0', color: '#0066cc', fontWeight: '600' }}>
                  ⓘ Aguardando assinaturas
                </p>
                <p style={{ margin: '0 0 12px 0', color: '#333', fontSize: '14px' }}>
                  O documento foi enviado para assinatura. Links foram enviados aos signatários.
                </p>
                {assinatura.linkAssinatura && (
                  <a
                    href={assinatura.linkAssinatura}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '8px 16px',
                      backgroundColor: '#0066cc',
                      color: '#fff',
                      textDecoration: 'none',
                      borderRadius: '4px',
                      fontSize: '13px',
                    }}
                  >
                    Assinar Documento
                  </a>
                )}
              </div>
            )}

            {assinatura.status === 'completado' && (
              <div
                style={{
                  backgroundColor: '#f0fff0',
                  padding: '16px',
                  borderRadius: '4px',
                  borderLeft: '4px solid #00cc00',
                  marginBottom: '20px',
                }}
              >
                <p style={{ margin: '0 0 8px 0', color: '#00cc00', fontWeight: '600' }}>
                  ✓ Documento assinado
                </p>
                <p style={{ margin: '0', color: '#333', fontSize: '14px' }}>
                  Todas as assinaturas foram coletadas com sucesso. O documento está pronto para download.
                </p>
              </div>
            )}

            {assinatura.status === 'cancelado' && (
              <div
                style={{
                  backgroundColor: '#fff0f0',
                  padding: '16px',
                  borderRadius: '4px',
                  borderLeft: '4px solid #cc0000',
                  marginBottom: '20px',
                }}
              >
                <p style={{ margin: '0 0 8px 0', color: '#cc0000', fontWeight: '600' }}>
                  ✗ Documento cancelado
                </p>
                <p style={{ margin: '0', color: '#333', fontSize: '14px' }}>
                  O processo de assinatura foi cancelado.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Iniciar Assinatura</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Nenhum documento de assinatura foi criado para esta vistoria. Clique no botão abaixo para criar um novo
              documento para assinatura eletrônica.
            </p>
            <form
              action={async () => {
                'use server';
                const resultado = await criarDocumentoAssinatura(id);
                if (resultado.success) {
                  redirect(`/vistorias/${id}/assinatura`);
                }
              }}
            >
              <button
                type="submit"
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#0066cc',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Criar Documento para Assinatura
              </button>
            </form>
          </div>
        )}

        {/* Informações Adicionais */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Informações</h2>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#666', fontSize: '14px' }}>
            <li style={{ marginBottom: '8px' }}>
              As assinaturas são coletadas via <strong>ZapSign</strong> com certificação ICP-Brasil
            </li>
            <li style={{ marginBottom: '8px' }}>
              O processo inclui vistoriador, inquilino e qualquer testemunha necessária
            </li>
            <li style={{ marginBottom: '8px' }}>
              Todas as ações são registradas em auditoria com IP, timestamp e detalhes
            </li>
            <li>
              O documento assinado pode ser baixado e possui validade legal reconhecida por lei
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

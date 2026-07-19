import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarDataHora } from '@/lib/formatacao';
import { FormularioUpload } from './FormularioUpload';

export const dynamic = 'force-dynamic';

interface LinhaDocumento {
  id: string;
  tipo: string;
  nome_arquivo: string;
  status_extracao: string;
  erro_extracao: string | null;
  criado_em: string;
  status_extracao_ia: string | null;
}

const RUBRICA_TIPO: Record<string, string> = {
  contrato_assinado: 'Contrato assinado',
  aditivo: 'Aditivo',
  comunicacao_renovacao: 'Comunicação de renovação',
  comunicacao_negociacao: 'Comunicação de negociação',
  outro: 'Outro',
};

const RUBRICA_STATUS: Record<string, string> = {
  pendente: 'Pendente de leitura',
  processando: 'Processando',
  concluida: 'Lido',
  falhou: 'Falha na leitura',
};

const RUBRICA_STATUS_IA: Record<string, string> = {
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  falhou: 'Falha na leitura por IA',
};

async function buscarDocumentos(contratoId: string): Promise<LinhaDocumento[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaDocumento>(
    `select da.id, da.tipo, da.nome_arquivo, da.status_extracao, da.erro_extracao, da.criado_em,
            edi.status as status_extracao_ia
     from documentos_anexados da
     left join lateral (
       select status from extracoes_documento_ia
       where documento_id = da.id
       order by criado_em desc
       limit 1
     ) edi on true
     where da.contrato_id = $1
     order by da.criado_em desc`,
    [contratoId],
  );
  return rows;
}

export default async function PaginaDocumentosContrato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let documentos: LinhaDocumento[] = [];
  let erro: string | null = null;
  try {
    documentos = await buscarDocumentos(id);
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Documentos do contrato</h2>
        <Link href="/contratos" className="botao-secundario">
          ← Voltar
        </Link>
      </div>
      <p className="section-hint">
        Contrato assinado, aditivo, ou comunicação de renovação/negociação por e-mail. O sistema converte o arquivo
        para texto e faz uma leitura assistida por IA (valor de aluguel, caução, custos obrigatórios, índice de
        reajuste) — sempre pendente de validação humana antes de qualquer valor ser gravado no contrato.
      </p>

      <FormularioUpload contratoId={id} />

      {erro ? (
        <p className="erro-conexao">{erro}</p>
      ) : documentos.length === 0 ? (
        <p className="vazio">Nenhum documento enviado ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Leitura por IA</th>
              <th>Enviado em</th>
            </tr>
          </thead>
          <tbody>
            {documentos.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.nome_arquivo}</td>
                <td>{RUBRICA_TIPO[doc.tipo] ?? doc.tipo}</td>
                <td>
                  <span className="tag">{RUBRICA_STATUS[doc.status_extracao] ?? doc.status_extracao}</span>
                  {doc.status_extracao === 'falhou' && doc.erro_extracao && (
                    <p className="erro-conexao">{doc.erro_extracao}</p>
                  )}
                </td>
                <td>
                  {doc.status_extracao_ia === 'pendente_revisao' ? (
                    <Link href={`/contratos/${id}/documentos/${doc.id}/revisao`}>Revisar leitura da IA</Link>
                  ) : (
                    <span className="tag">{RUBRICA_STATUS_IA[doc.status_extracao_ia ?? ''] ?? '—'}</span>
                  )}
                </td>
                <td>{formatarDataHora(doc.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

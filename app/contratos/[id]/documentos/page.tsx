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

async function buscarDocumentos(contratoId: string): Promise<LinhaDocumento[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaDocumento>(
    `select id, tipo, nome_arquivo, status_extracao, erro_extracao, criado_em
     from documentos_anexados
     where contrato_id = $1
     order by criado_em desc`,
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
                <td>{formatarDataHora(doc.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

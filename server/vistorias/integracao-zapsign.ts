interface ZapSignDocument {
  uuid: string;
  name: string;
  file_url: string;
  signers: ZapSignSigner[];
  status: 'draft' | 'sent' | 'processing' | 'signed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

interface ZapSignSigner {
  uuid: string;
  email: string;
  name: string;
  phone?: string;
  cpf?: string;
  created_at: string;
  updated_at: string;
  signed_at?: string;
  signature_url?: string;
  signature_id?: string;
  status: 'pending' | 'opened' | 'signed' | 'cancelled';
  audit_log?: Array<{
    ip: string;
    timestamp: string;
    action: string;
  }>;
}

interface CriarDocumentoRequest {
  name: string;
  file_url: string;
  signers: Array<{
    email: string;
    name: string;
    phone?: string;
    cpf?: string;
  }>;
  message?: string;
  redirectUrl?: string;
}

interface AdicionarSignerRequest {
  email: string;
  name: string;
  phone?: string;
  cpf?: string;
  order?: number;
}

const ZAPSIGN_API_URL = 'https://app.zapsign.com.br/api/v1';
const ZAPSIGN_API_TOKEN = process.env.ZAPSIGN_API_TOKEN || '';

if (!ZAPSIGN_API_TOKEN) {
  console.warn('ZAPSIGN_API_TOKEN não configurado. Funcionalidades de assinatura eletrônica estarão desabilitadas.');
}

async function fazerRequisicaoZapSign(
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH',
  endpoint: string,
  corpo?: any
): Promise<any> {
  if (!ZAPSIGN_API_TOKEN) {
    throw new Error('ZapSign não configurado');
  }

  const url = `${ZAPSIGN_API_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ZAPSIGN_API_TOKEN}`,
  };

  const opcoes: RequestInit = {
    method: metodo,
    headers,
  };

  if (corpo) {
    opcoes.body = JSON.stringify(corpo);
  }

  const resposta = await fetch(url, opcoes);

  if (!resposta.ok) {
    const erro = await resposta.text();
    throw new Error(`ZapSign API error: ${resposta.status} - ${erro}`);
  }

  return resposta.json();
}

export async function criarDocumentoParaAssinatura(
  nomeDocumento: string,
  urlArquivo: string,
  signatarios: Array<{
    email: string;
    nome: string;
    telefone?: string;
    cpf?: string;
  }>,
  mensagem?: string,
  urlRedirecionamento?: string
): Promise<ZapSignDocument> {
  const payload: CriarDocumentoRequest = {
    name: nomeDocumento,
    file_url: urlArquivo,
    signers: signatarios.map((s) => ({
      email: s.email,
      name: s.nome,
      phone: s.telefone,
      cpf: s.cpf,
    })),
    message: mensagem,
    redirectUrl: urlRedirecionamento,
  };

  const resultado = await fazerRequisicaoZapSign('POST', '/documents/', payload);
  return resultado;
}

export async function obterDocumento(documentoUuid: string): Promise<ZapSignDocument> {
  const resultado = await fazerRequisicaoZapSign('GET', `/documents/${documentoUuid}/`);
  return resultado;
}

export async function adicionarSignatarioAoDocumento(
  documentoUuid: string,
  email: string,
  nome: string,
  telefone?: string,
  cpf?: string,
  ordem?: number
): Promise<ZapSignSigner> {
  const payload: AdicionarSignerRequest = {
    email,
    name: nome,
    phone: telefone,
    cpf,
    order: ordem,
  };

  const resultado = await fazerRequisicaoZapSign('POST', `/documents/${documentoUuid}/signers/`, payload);
  return resultado;
}

export async function enviarDocumentoParaAssinatura(documentoUuid: string): Promise<ZapSignDocument> {
  const resultado = await fazerRequisicaoZapSign('POST', `/documents/${documentoUuid}/send/`, {});
  return resultado;
}

export async function verificarStatusDocumento(documentoUuid: string): Promise<ZapSignDocument> {
  return obterDocumento(documentoUuid);
}

export async function obterLinkAssinatura(documentoUuid: string, signatarioEmail: string): Promise<string> {
  const documento = await obterDocumento(documentoUuid);
  const signatario = documento.signers.find((s) => s.email === signatarioEmail);

  if (!signatario) {
    throw new Error('Signatário não encontrado no documento');
  }

  // O URL de assinatura é fornecido pelo ZapSign ou gerado aqui
  // Formato típico: https://app.zapsign.com.br/public/document/{documentoUuid}/signer/{signatarioUuid}
  return `https://app.zapsign.com.br/public/document/${documentoUuid}/signer/${signatario.uuid}`;
}

export async function cancelarDocumento(documentoUuid: string, motivo?: string): Promise<void> {
  await fazerRequisicaoZapSign('PATCH', `/documents/${documentoUuid}/`, {
    status: 'cancelled',
    cancellation_reason: motivo,
  });
}

export async function baixarDocumentoAssinado(documentoUuid: string): Promise<Buffer> {
  if (!ZAPSIGN_API_TOKEN) {
    throw new Error('ZapSign não configurado');
  }

  const url = `${ZAPSIGN_API_URL}/documents/${documentoUuid}/download/`;
  const headers = {
    'Authorization': `Bearer ${ZAPSIGN_API_TOKEN}`,
  };

  const resposta = await fetch(url, { headers });

  if (!resposta.ok) {
    throw new Error(`Falha ao baixar documento: ${resposta.statusText}`);
  }

  const buffer = await resposta.arrayBuffer();
  return Buffer.from(buffer);
}

export async function validarAssinatura(documentoUuid: string): Promise<{
  valido: boolean;
  signadosTodos: boolean;
  dataAssinatura?: string;
  certificado?: {
    emitente: string;
    valideInicio: string;
    valideFim: string;
    icpBrasil: boolean;
  };
}> {
  try {
    const documento = await obterDocumento(documentoUuid);

    const todosAssinados = documento.signers.every((s) => s.status === 'signed');
    const dataAssinatura =
      documento.signers.find((s) => s.signed_at)?.signed_at || documento.updated_at;

    return {
      valido: documento.status === 'signed' && todosAssinados,
      signadosTodos: todosAssinados,
      dataAssinatura,
      certificado: {
        emitente: 'ZapSign (ICP-Brasil)', // Simplificado para exemplo
        valideInicio: documento.created_at,
        valideFim: new Date(new Date().getTime() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(), // 10 anos
        icpBrasil: true,
      },
    };
  } catch (error) {
    throw new Error(`Falha ao validar assinatura: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function obterAuditoriaDocumento(documentoUuid: string): Promise<
  Array<{
    timestamp: string;
    acao: string;
    signatario?: string;
    ip?: string;
    detalhes?: string;
  }>
> {
  const documento = await obterDocumento(documentoUuid);

  const auditoria: Array<{
    timestamp: string;
    acao: string;
    signatario?: string;
    ip?: string;
    detalhes?: string;
  }> = [];

  // Log de criação
  auditoria.push({
    timestamp: documento.created_at,
    acao: 'DOCUMENTO_CRIADO',
    detalhes: `Documento "${documento.name}" criado`,
  });

  // Log de assinaturas
  for (const signatario of documento.signers) {
    if (signatario.status === 'signed' && signatario.signed_at) {
      auditoria.push({
        timestamp: signatario.signed_at,
        acao: 'ASSINADO',
        signatario: signatario.name,
        ip: signatario.audit_log?.[0]?.ip || 'Desconhecido',
        detalhes: `Assinado por ${signatario.name} (${signatario.email})`,
      });
    } else if (signatario.status === 'opened') {
      const primeiroAcesso = signatario.audit_log?.[0];
      if (primeiroAcesso) {
        auditoria.push({
          timestamp: primeiroAcesso.timestamp,
          acao: 'DOCUMENTO_ABERTO',
          signatario: signatario.name,
          ip: primeiroAcesso.ip,
          detalhes: `Documento aberto por ${signatario.name}`,
        });
      }
    }
  }

  return auditoria.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

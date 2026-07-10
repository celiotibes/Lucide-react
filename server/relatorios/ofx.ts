// Serializador OFX 1.0 (SGML) — o formato padrão que sistemas contábeis e
// módulos de conciliação bancária (Domínio, Alterdata, SAGE, ContaAzul
// etc.) importam para extrato de movimentação financeira (docs/15). Ao
// contrário do CSV (regime de competência — faturas emitidas), OFX aqui
// representa regime de CAIXA: dinheiro que efetivamente entrou
// (`cobrancas_asaas` com pagamento confirmado — mesma distinção
// competência/caixa já usada em `database/schema.sql`, comentário da
// tabela `faturas`).

export interface TransacaoOFX {
  /** Identificador único e estável da transação (FITID) — evita duplicar ao reimportar. */
  id: string;
  data: Date;
  /** Positivo = crédito (dinheiro recebido). Negativo = débito. */
  valor: number;
  descricao: string;
}

export interface OpcoesOFX {
  /** Identificador da "conta" no extrato — ex.: "ASAAS" (não é uma conta bancária real, é a origem dos dados). */
  contaId: string;
  bancoId?: string;
  moeda?: string;
  dataInicio: Date;
  dataFim: Date;
  dataGeracao?: Date;
}

export function gerarOFX(transacoes: TransacaoOFX[], opcoes: OpcoesOFX): string {
  const moeda = opcoes.moeda ?? 'BRL';
  const bancoId = opcoes.bancoId ?? '0000';
  const dataGeracao = opcoes.dataGeracao ?? new Date();

  const transacoesOFX = transacoes
    .map(
      (t) => `<STMTTRN>
<TRNTYPE>${t.valor >= 0 ? 'CREDIT' : 'DEBIT'}
<DTPOSTED>${formatarDataOFX(t.data)}
<TRNAMT>${t.valor.toFixed(2)}
<FITID>${escaparSGML(t.id)}
<MEMO>${escaparSGML(t.descricao)}
</STMTTRN>`,
    )
    .join('\n');

  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:UTF-8
CHARSET:CSUTF-8
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>${formatarDataHoraOFX(dataGeracao)}
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>${moeda}
<BANKACCTFROM>
<BANKID>${bancoId}
<ACCTID>${escaparSGML(opcoes.contaId)}
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${formatarDataOFX(opcoes.dataInicio)}
<DTEND>${formatarDataOFX(opcoes.dataFim)}
${transacoesOFX}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;
}

function formatarDataOFX(data: Date): string {
  return `${data.getUTCFullYear()}${pad2(data.getUTCMonth() + 1)}${pad2(data.getUTCDate())}`;
}

function formatarDataHoraOFX(data: Date): string {
  return `${formatarDataOFX(data)}${pad2(data.getUTCHours())}${pad2(data.getUTCMinutes())}${pad2(data.getUTCSeconds())}`;
}

function pad2(valor: number): string {
  return String(valor).padStart(2, '0');
}

function escaparSGML(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, ' ');
}

// ---------------------------------------------------------------------------
// Leitura (importação de extrato bancário — docs/18): direção inversa de
// `gerarOFX`. Escopo deliberadamente limitado a OFX 1.0 SGML (tags de linha
// única, sem fechamento obrigatório) — é o que a maioria dos bancos
// brasileiros exporta e é o formato que este mesmo módulo gera. Não
// interpreta OFX 2.x baseado em XML (tags sempre fechadas, namespaces) —
// sem uma amostra real de arquivo 2.x à mão, seria uma suposição não
// verificada sobre um formato genuinamente diferente.

export class OFXInvalidoError extends Error {}

export interface TransacaoOFXImportada {
  /** FITID — identificador único da transação dado pelo banco/instituição. */
  id: string;
  data: Date;
  /** Sinal já vem do próprio TRNAMT do arquivo — positivo/negativo conforme o banco reportou. */
  valor: number;
  descricao: string;
}

export function parsearOFX(conteudoOFX: string): TransacaoOFXImportada[] {
  const blocos = conteudoOFX.split(/<STMTTRN>/i).slice(1);
  return blocos.map((bloco) => parsearBlocoTransacao(bloco.split(/<\/STMTTRN>/i)[0]));
}

function parsearBlocoTransacao(bloco: string): TransacaoOFXImportada {
  const dtPosted = extrairTagOFX(bloco, 'DTPOSTED');
  const trnAmt = extrairTagOFX(bloco, 'TRNAMT');
  const fitId = extrairTagOFX(bloco, 'FITID');
  const memo = extrairTagOFX(bloco, 'MEMO') ?? '';

  if (!dtPosted) throw new OFXInvalidoError('Transação OFX sem DTPOSTED');
  if (!trnAmt) throw new OFXInvalidoError('Transação OFX sem TRNAMT');
  if (!fitId) throw new OFXInvalidoError('Transação OFX sem FITID');

  return {
    id: fitId,
    data: parsearDataOFX(dtPosted),
    valor: Number(trnAmt),
    descricao: desescaparSGML(memo),
  };
}

function extrairTagOFX(bloco: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^\\r\\n<]*)`, 'i').exec(bloco);
  return match ? match[1].trim() : null;
}

function parsearDataOFX(valor: string): Date {
  // YYYYMMDD ou YYYYMMDDHHMMSS, com sufixo opcional de timezone entre
  // colchetes (ex.: "20260710120000[-3:BRT]") — o timezone é ignorado, os
  // dígitos são tratados como já estando na convenção UTC do resto do
  // projeto (mesma simplificação de server/atendimento/prazoSla.ts).
  const soDigitos = valor.split('[')[0].trim();
  if (!/^\d{8,14}$/.test(soDigitos)) {
    throw new OFXInvalidoError(`Data OFX inválida: "${valor}"`);
  }
  const ano = Number(soDigitos.slice(0, 4));
  const mes = Number(soDigitos.slice(4, 6));
  const dia = Number(soDigitos.slice(6, 8));
  const hora = soDigitos.length >= 10 ? Number(soDigitos.slice(8, 10)) : 0;
  const minuto = soDigitos.length >= 12 ? Number(soDigitos.slice(10, 12)) : 0;
  const segundo = soDigitos.length >= 14 ? Number(soDigitos.slice(12, 14)) : 0;
  return new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo));
}

function desescaparSGML(texto: string): string {
  return texto.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

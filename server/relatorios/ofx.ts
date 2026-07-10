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

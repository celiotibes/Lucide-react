export interface DataJudProcess {
  numero: string;
  numeroFormatado: string;
  cnj: string;
  tribunal: {
    codigo: number;
    nome: string;
    sigla: string;
  };
  forum: {
    codigo: number;
    nome: string;
  };
  assunto: string;
  dataRegistro: string;
  dataAtualizacao: string;
  status: string;
  movimentacoes?: DataJudMovement[];
}

export interface DataJudMovement {
  dataMovimentacao: string;
  descricaoMovimentacao: string;
  typeMovimentacao?: number;
}

export interface DataJudSearchParams {
  numeroProcesso?: string;
  numeroProcessoFormatado?: string;
  parteNome?: string;
  partePessoaJuridica?: string;
  dataRegistroInicio?: string;
  dataRegistroFim?: string;
  dataAtualizacaoInicio?: string;
  dataAtualizacaoFim?: string;
  assunto?: string;
  formato?: 'json' | 'xml';
  pagina?: number;
  limite?: number;
}

export interface DataJudApiResponse<T> {
  dados: T[];
  paginacao?: {
    pagina: number;
    total: number;
    limite: number;
    totalPaginas: number;
  };
}

export interface DataJudProcessDetail extends DataJudProcess {
  partes: DataJudParty[];
  movimentacoes: DataJudMovement[];
  documentos?: DataJudDocument[];
}

export interface DataJudParty {
  nome: string;
  participacao: string;
  pessoaJuridica?: boolean;
  advogados?: DataJudLawyer[];
}

export interface DataJudLawyer {
  nome: string;
  oabNumero: string;
  oabEstado: string;
}

export interface DataJudDocument {
  id: string;
  titulo: string;
  dataUpload: string;
  tipo: string;
  url?: string;
}

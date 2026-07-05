export interface ProjudiAuthRequest {
  codigoOrgao: string;
  usuario: string;
  senha: string;
}

export interface ProjudiAuthResponse {
  token: string;
  dataExpiracao: string;
}

export interface ProjudiPetition {
  numeroProcesso: string;
  tipoDocumento: string;
  descricaoDocumento: string;
  documentoRTF: string;
  assuntoMovimentacao?: string;
  dataMovimentacao?: string;
}

export interface ProjudiPetitionResponse {
  protocolo: string;
  dataProtocolo: string;
  descricao: string;
  sucesso: boolean;
  mensagem: string;
  erros?: string[];
}

export interface ProjudiProcessSearch {
  numeroProcesso?: string;
  parteNome?: string;
  dataInicio?: string;
  dataFim?: string;
}

export interface ProjudiProcessData {
  numeroProcesso: string;
  numeroProcessoFormatado: string;
  anoJudicializado: number;
  status: string;
  dataAbertura: string;
  dataUltimaMovimentacao: string;
  partes: ProjudiParty[];
  movimentacoes: ProjudiMovement[];
  documentos: ProjudiDocument[];
}

export interface ProjudiParty {
  nome: string;
  pessoaJuridica: boolean;
  documento: string;
  tipo: string;
  advogados?: ProjudiLawyer[];
}

export interface ProjudiLawyer {
  nome: string;
  oabNumero: string;
  email: string;
  telefone: string;
}

export interface ProjudiMovement {
  dataMovimentacao: string;
  descricao: string;
  status: string;
  complemento?: string;
}

export interface ProjudiDocument {
  id: string;
  descricao: string;
  tipo: string;
  dataUpload: string;
  tamanho: number;
  nomeArquivo: string;
}

export interface ProjudiDownloadRequest {
  numeroProcesso: string;
  idDocumento: string;
}

export interface ProjudiDownloadResponse {
  conteudo: Buffer;
  nomeArquivo: string;
  mimeType: string;
}

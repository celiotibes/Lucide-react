import { Process, Petition, Movement } from '@/types';

export interface TribunalAdapter {
  // Configuração
  getName(): string;
  getBaseUrl(): string;
  getTribunalCode(): string;

  // Processos
  getProcess(number: string): Promise<Process>;
  searchProcesses(criteria: SearchCriteria): Promise<Process[]>;
  getMovements(processNumber: string): Promise<Movement[]>;

  // Petições
  submitPetition(petition: Petition, certificatePath: string, certPassword: string): Promise<ProtocolResponse>;
  getPetitionStatus(protocolNumber: string): Promise<PetitionStatus>;

  // Certificados
  validateCertificate(cert: Buffer, password: string): Promise<boolean>;

  // Status
  isHealthy(): Promise<boolean>;
}

export interface SearchCriteria {
  partyName?: string;
  subject?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  limit?: number;
}

export interface Process {
  number: string;
  cnj: string;
  tribunal: string;
  status: string;
  plaintiff?: string;
  defendant?: string;
  subject?: string;
  lastMovement?: Date;
  openDate?: Date;
}

export interface Movement {
  date: Date;
  description: string;
  status?: string;
  complement?: string;
}

export interface ProtocolResponse {
  protocolo: string;
  dataProtocolo: Date;
  sucesso: boolean;
  mensagem?: string;
  erros?: string[];
}

export interface PetitionStatus {
  protocolo: string;
  status: 'enviada' | 'processando' | 'aceita' | 'rejeitada';
  dataStatus: Date;
  mensagem?: string;
}

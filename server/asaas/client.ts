// Cliente HTTP fino para a API do Asaas (boleto/PIX/split — docs/03).
// `fetchImpl` é injetável de propósito: os testes passam um fetch fake
// para verificar forma da requisição/resposta sem bater na rede.
//
// LIMITAÇÃO HONESTA: isto foi implementado a partir da documentação
// pública da API do Asaas, mas nunca foi executado contra o sandbox real
// deles (não há chave de API neste ambiente). Os testes provam que a forma
// da requisição/resposta está correta contra o que a documentação
// descreve — não substituem um teste de ponta a ponta com credencial de
// sandbox antes de ir para produção.

export interface AsaasConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface CriarCobrancaInput {
  customerId: string;
  valor: number;
  vencimento: string; // 'YYYY-MM-DD'
  tipo: 'BOLETO' | 'PIX';
  descricao?: string;
  /** Fatura interna correspondente — vira `externalReference`, usado para casar o webhook de volta. */
  referenciaExterna: string;
}

export interface CobrancaAsaas {
  id: string;
  status: string;
  valor: number;
  linkFatura: string;
  linkBoleto?: string;
  qrCodePix?: string;
}

// ============================================================================
// NFS-e (Nota Fiscal de Serviço Eletrônica)
// ============================================================================

export interface CriarNfseInput {
  prestador: {
    nome: string;
    cpfCnpj: string;
    email: string;
    telefone?: string;
  };
  servico: {
    descricao: string;
    valor: number;
    dataExecucao: string; // 'YYYY-MM-DD'
    residencial?: string;
  };
  referenciaExterna: string; // fechamento_id
}

export interface NfseAsaas {
  id: string;
  nfseId: string; // ID da NFS-e gerada pela prefeitura
  status: 'pendente' | 'emitida' | 'processada' | 'cancelada';
  valor: number;
  url: string;
  protocolo?: string;
  dataEmissao?: string;
}

// ============================================================================
// PIX (Transferência instantânea)
// ============================================================================

export interface PixKey {
  tipo: 'cpf' | 'email' | 'telefone' | 'aleatoria';
  valor: string;
}

export interface EnviarPixInput {
  prestador: {
    nome: string;
    cpfCnpj: string;
  };
  chavePix: PixKey;
  valor: number;
  descricao: string;
  referenciaExterna: string; // fechamento_id
}

export interface PixAsaas {
  id: string;
  status: 'enviado' | 'confirmado' | 'devolvido' | 'expirado';
  valor: number;
  dataEnvio: string;
  dataConfirmacao?: string;
  motivoDevolucao?: string;
}

export interface CriarClienteInput {
  nome: string;
  cpfCnpj: string;
  email?: string;
  telefone?: string;
}

export interface ClienteAsaas {
  id: string;
  nome: string;
  cpfCnpj: string;
}

export class AsaasApiError extends Error {
  constructor(
    message: string,
    public readonly statusHttp: number,
    public readonly corpo: unknown,
  ) {
    super(message);
    this.name = 'AsaasApiError';
  }
}

const BASE_URL_PADRAO = 'https://api.asaas.com/v3';

interface PagamentoAsaasBruto {
  id: string;
  status: string;
  value: number;
  invoiceUrl: string;
  bankSlipUrl?: string;
  pixQrCodeId?: string;
}

function mapearPagamento(corpo: PagamentoAsaasBruto): CobrancaAsaas {
  return {
    id: corpo.id,
    status: corpo.status,
    valor: corpo.value,
    linkFatura: corpo.invoiceUrl,
    linkBoleto: corpo.bankSlipUrl,
    qrCodePix: corpo.pixQrCodeId,
  };
}

interface ClienteAsaasBruto {
  id: string;
  name: string;
  cpfCnpj: string;
}

interface ListaClientesAsaasBruto {
  data?: ClienteAsaasBruto[];
}

function mapearCliente(corpo: ClienteAsaasBruto): ClienteAsaas {
  return { id: corpo.id, nome: corpo.name, cpfCnpj: corpo.cpfCnpj };
}

export class AsaasClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: AsaasConfig) {
    if (!config.apiKey) {
      throw new Error('AsaasClient requer apiKey');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? BASE_URL_PADRAO;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CobrancaAsaas> {
    const resposta = await this.fetchImpl(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: this.apiKey,
      },
      body: JSON.stringify({
        customer: input.customerId,
        billingType: input.tipo,
        value: input.valor,
        dueDate: input.vencimento,
        description: input.descricao,
        externalReference: input.referenciaExterna,
      }),
    });

    const corpo = (await resposta.json()) as PagamentoAsaasBruto;

    if (!resposta.ok) {
      throw new AsaasApiError(
        `Asaas retornou ${resposta.status} ao criar cobrança`,
        resposta.status,
        corpo,
      );
    }

    return mapearPagamento(corpo);
  }

  async consultarCobranca(cobrancaId: string): Promise<CobrancaAsaas> {
    const resposta = await this.fetchImpl(`${this.baseUrl}/payments/${cobrancaId}`, {
      headers: { access_token: this.apiKey },
    });

    const corpo = (await resposta.json()) as PagamentoAsaasBruto;

    if (!resposta.ok) {
      throw new AsaasApiError(
        `Asaas retornou ${resposta.status} ao consultar cobrança ${cobrancaId}`,
        resposta.status,
        corpo,
      );
    }

    return mapearPagamento(corpo);
  }

  /** Cria um cliente Asaas — pré-requisito para `criarCobranca` (que exige um `customerId` já existente do lado deles). */
  async criarCliente(input: CriarClienteInput): Promise<ClienteAsaas> {
    const resposta = await this.fetchImpl(`${this.baseUrl}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: this.apiKey,
      },
      body: JSON.stringify({
        name: input.nome,
        cpfCnpj: input.cpfCnpj,
        email: input.email,
        phone: input.telefone,
      }),
    });

    const corpo = (await resposta.json()) as ClienteAsaasBruto;

    if (!resposta.ok) {
      throw new AsaasApiError(`Asaas retornou ${resposta.status} ao criar cliente`, resposta.status, corpo);
    }

    return mapearCliente(corpo);
  }

  /** Busca um cliente já cadastrado pelo CPF/CNPJ, para não duplicar o cadastro no Asaas a cada nova cobrança. `null` se não encontrar. */
  async buscarClientePorCpfCnpj(cpfCnpj: string): Promise<ClienteAsaas | null> {
    const resposta = await this.fetchImpl(`${this.baseUrl}/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`, {
      headers: { access_token: this.apiKey },
    });

    const corpo = (await resposta.json()) as ListaClientesAsaasBruto;

    if (!resposta.ok) {
      throw new AsaasApiError(`Asaas retornou ${resposta.status} ao buscar cliente por CPF/CNPJ`, resposta.status, corpo);
    }

    const encontrados = corpo.data ?? [];
    return encontrados.length > 0 ? mapearCliente(encontrados[0]) : null;
  }

  // ========================================================================
  // NFS-e (Nota Fiscal de Serviço Eletrônica)
  // ========================================================================

  /** Gera uma NFS-e via Asaas (envia para prefeitura) */
  async criarNfse(input: CriarNfseInput): Promise<NfseAsaas> {
    const resposta = await this.fetchImpl(`${this.baseUrl}/invoices/service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: this.apiKey,
      },
      body: JSON.stringify({
        // Prestador (fornecedor do serviço)
        serviceProvider: {
          name: input.prestador.nome,
          cpfCnpj: input.prestador.cpfCnpj.replace(/\D/g, ''),
          email: input.prestador.email,
          phone: input.prestador.telefone,
        },
        // Serviço prestado
        service: {
          description: input.servico.descricao,
          amount: input.servico.valor,
          executionDate: input.servico.dataExecucao,
          location: input.servico.residencial || 'Conforme contrato',
        },
        externalReference: input.referenciaExterna,
      }),
    });

    const corpo = (await resposta.json()) as Record<string, unknown>;

    if (!resposta.ok) {
      throw new AsaasApiError(
        `Asaas retornou ${resposta.status} ao criar NFS-e`,
        resposta.status,
        corpo,
      );
    }

    return {
      id: (corpo.id as string) || '',
      nfseId: (corpo.nfseId as string) || '',
      status: 'pendente',
      valor: input.servico.valor,
      url: (corpo.url as string) || '',
      protocolo: (corpo.protocol as string) || undefined,
      dataEmissao: new Date().toISOString(),
    };
  }

  /** Consulta status de uma NFS-e gerada */
  async consultarNfse(nfseId: string): Promise<NfseAsaas> {
    const resposta = await this.fetchImpl(`${this.baseUrl}/invoices/service/${nfseId}`, {
      headers: { access_token: this.apiKey },
    });

    const corpo = (await resposta.json()) as Record<string, unknown>;

    if (!resposta.ok) {
      throw new AsaasApiError(
        `Asaas retornou ${resposta.status} ao consultar NFS-e ${nfseId}`,
        resposta.status,
        corpo,
      );
    }

    return {
      id: (corpo.id as string) || '',
      nfseId: (corpo.nfseId as string) || '',
      status: (corpo.status as NfseAsaas['status']) || 'pendente',
      valor: (corpo.amount as number) || 0,
      url: (corpo.url as string) || '',
      protocolo: (corpo.protocol as string) || undefined,
      dataEmissao: (corpo.issuanceDate as string) || undefined,
    };
  }

  /** Lista NFS-es por referência externa (fechamento_id) */
  async listarNfses(referenciaExterna: string): Promise<NfseAsaas[]> {
    const resposta = await this.fetchImpl(
      `${this.baseUrl}/invoices/service?externalReference=${encodeURIComponent(referenciaExterna)}`,
      { headers: { access_token: this.apiKey } },
    );

    const corpo = (await resposta.json()) as Record<string, unknown>;

    if (!resposta.ok) {
      throw new AsaasApiError(
        `Asaas retornou ${resposta.status} ao listar NFS-es`,
        resposta.status,
        corpo,
      );
    }

    const lista = (corpo.data as Array<Record<string, unknown>>) || [];
    return lista.map((item) => ({
      id: (item.id as string) || '',
      nfseId: (item.nfseId as string) || '',
      status: (item.status as NfseAsaas['status']) || 'pendente',
      valor: (item.amount as number) || 0,
      url: (item.url as string) || '',
      protocolo: (item.protocol as string) || undefined,
      dataEmissao: (item.issuanceDate as string) || undefined,
    }));
  }

  // ========================================================================
  // PIX (Transferência Instantânea)
  // ========================================================================

  /** Valida uma chave PIX */
  async validarChavePix(chavePix: PixKey): Promise<boolean> {
    // Validação local simples (sem API)
    switch (chavePix.tipo) {
      case 'cpf':
        return /^\d{11}$/.test(chavePix.valor.replace(/\D/g, ''));
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chavePix.valor);
      case 'telefone':
        return /^\d{10,11}$/.test(chavePix.valor.replace(/\D/g, ''));
      case 'aleatoria':
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chavePix.valor);
      default:
        return false;
    }
  }

  /** Envia PIX (transferência instantânea) para o prestador */
  async enviarPix(input: EnviarPixInput): Promise<PixAsaas> {
    // Validar chave PIX
    if (!(await this.validarChavePix(input.chavePix))) {
      throw new AsaasApiError(
        `Chave PIX inválida: ${input.chavePix.tipo} = ${input.chavePix.valor}`,
        400,
        { tipo: input.chavePix.tipo, valor: input.chavePix.valor },
      );
    }

    const resposta = await this.fetchImpl(`${this.baseUrl}/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: this.apiKey,
      },
      body: JSON.stringify({
        amount: input.valor,
        description: input.descricao,
        pixKey: {
          type: input.chavePix.tipo.toUpperCase(),
          value: input.chavePix.valor,
        },
        beneficiary: {
          name: input.prestador.nome,
          cpfCnpj: input.prestador.cpfCnpj.replace(/\D/g, ''),
        },
        externalReference: input.referenciaExterna,
      }),
    });

    const corpo = (await resposta.json()) as Record<string, unknown>;

    if (!resposta.ok) {
      throw new AsaasApiError(
        `Asaas retornou ${resposta.status} ao enviar PIX`,
        resposta.status,
        corpo,
      );
    }

    return {
      id: (corpo.id as string) || '',
      status: 'enviado',
      valor: input.valor,
      dataEnvio: new Date().toISOString(),
    };
  }

  /** Consulta status de um PIX enviado */
  async consultarPix(pixId: string): Promise<PixAsaas> {
    const resposta = await this.fetchImpl(`${this.baseUrl}/transfers/${pixId}`, {
      headers: { access_token: this.apiKey },
    });

    const corpo = (await resposta.json()) as Record<string, unknown>;

    if (!resposta.ok) {
      throw new AsaasApiError(
        `Asaas retornou ${resposta.status} ao consultar PIX ${pixId}`,
        resposta.status,
        corpo,
      );
    }

    const statusMap: Record<string, PixAsaas['status']> = {
      PENDING: 'enviado',
      TRANSFERRED: 'confirmado',
      FAILED: 'devolvido',
      EXPIRED: 'expirado',
    };

    return {
      id: (corpo.id as string) || '',
      status: statusMap[(corpo.status as string) || 'PENDING'] || 'enviado',
      valor: (corpo.amount as number) || 0,
      dataEnvio: (corpo.createdDate as string) || new Date().toISOString(),
      dataConfirmacao: (corpo.transferredDate as string) || undefined,
      motivoDevolucao: (corpo.failureReason as string) || undefined,
    };
  }

  /** Lista PIXes por referência externa (fechamento_id) */
  async listarPixesPorReferencia(referenciaExterna: string): Promise<PixAsaas[]> {
    const resposta = await this.fetchImpl(
      `${this.baseUrl}/transfers?externalReference=${encodeURIComponent(referenciaExterna)}`,
      { headers: { access_token: this.apiKey } },
    );

    const corpo = (await resposta.json()) as Record<string, unknown>;

    if (!resposta.ok) {
      throw new AsaasApiError(
        `Asaas retornou ${resposta.status} ao listar PIXes`,
        resposta.status,
        corpo,
      );
    }

    const statusMap: Record<string, PixAsaas['status']> = {
      PENDING: 'enviado',
      TRANSFERRED: 'confirmado',
      FAILED: 'devolvido',
      EXPIRED: 'expirado',
    };

    const lista = (corpo.data as Array<Record<string, unknown>>) || [];
    return lista.map((item) => ({
      id: (item.id as string) || '',
      status: statusMap[(item.status as string) || 'PENDING'] || 'enviado',
      valor: (item.amount as number) || 0,
      dataEnvio: (item.createdDate as string) || new Date().toISOString(),
      dataConfirmacao: (item.transferredDate as string) || undefined,
      motivoDevolucao: (item.failureReason as string) || undefined,
    }));
  }
}

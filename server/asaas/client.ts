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
}

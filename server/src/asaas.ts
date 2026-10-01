/**
 * Cliente HTTP fino para a API da Asaas (emissão de boleto/PIX, consulta de cobrança).
 *
 * Por quê um arquivo só, sem SDK: a API da Asaas é um REST simples o bastante (poucos
 * endpoints usados aqui — clientes, cobranças) para não justificar trazer uma dependência
 * nova (confirmado: `axios` não é dependência deste server — ver package.json — e `fetch`
 * já é nativo do Node 22, a mesma versão deste runtime). `fetchImpl` é injetável de
 * propósito: os testes de rota/domínio passam um mock e nunca tocam a rede real.
 *
 * REGRA DE OURO DE SEGURANÇA: `ASAAS_API_KEY` só é lida DENTRO de cada função, no momento
 * da chamada — nunca no topo do módulo. Se lêssemos no topo, importar este arquivo (em
 * qualquer teste, ou na inicialização do servidor via index.ts) já exigiria a env var
 * configurada, mesmo para quem nunca vai emitir uma cobrança. O resto do app precisa
 * continuar funcionando sem Asaas configurado — só a chamada de fato falha, com mensagem
 * clara, e só quando alguém tenta usá-la.
 */

export type FetchLike = typeof fetch;

/** Lançado quando a env var obrigatória não está configurada — nunca no boot do servidor,
 * só no momento em que uma função deste módulo é de fato chamada. */
export class AsaasConfiguracaoAusenteError extends Error {
  constructor(variavel: string) {
    super(
      `${variavel} não está configurada no ambiente do servidor — defina-a no .env antes de emitir cobranças via Asaas (ver .env.example).`,
    );
    this.name = "AsaasConfiguracaoAusenteError";
  }
}

/** Lançado quando a API da Asaas responde com erro — guarda o status HTTP e o corpo bruto
 * (quando é JSON com `errors`, a Asaas descreve o campo problemático) para quem chamou
 * decidir como expor isso ao usuário, sem precisar reanalisar a resposta. */
export class AsaasApiError extends Error {
  status: number;
  corpo: unknown;
  constructor(status: number, corpo: unknown) {
    const detalhe = extrairMensagemErro(corpo);
    super(`Asaas respondeu ${status}${detalhe ? `: ${detalhe}` : ""}`);
    this.name = "AsaasApiError";
    this.status = status;
    this.corpo = corpo;
  }
}

function extrairMensagemErro(corpo: unknown): string | null {
  if (corpo && typeof corpo === "object" && Array.isArray((corpo as { errors?: unknown[] }).errors)) {
    const erros = (corpo as { errors: { description?: string }[] }).errors;
    return erros.map((e) => e.description).filter(Boolean).join("; ") || null;
  }
  return null;
}

function baseUrl(): string {
  return process.env.ASAAS_BASE_URL ?? "https://sandbox.asaas.com/api/v3";
}

function chaveApi(): string {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new AsaasConfiguracaoAusenteError("ASAAS_API_KEY");
  return chave;
}

async function chamar<T>(
  fetchImpl: FetchLike,
  metodo: "GET" | "POST",
  caminho: string,
  corpo?: unknown,
): Promise<T> {
  const resposta = await fetchImpl(`${baseUrl()}${caminho}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      access_token: chaveApi(),
    },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });

  const textoCorpo = await resposta.text();
  const jsonCorpo = textoCorpo ? JSON.parse(textoCorpo) : {};

  if (!resposta.ok) {
    throw new AsaasApiError(resposta.status, jsonCorpo);
  }
  return jsonCorpo as T;
}

export interface DadosClienteAsaas {
  nome: string;
  cpfCnpj: string;
  email?: string;
  telefone?: string;
}

export interface ClienteAsaas {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string | null;
  mobilePhone?: string | null;
}

/** POST /customers — cria (ou, na prática, a Asaas também devolve o já existente quando o
 * cpfCnpj já está cadastrado na mesma conta, mas isso é comportamento da Asaas, não deste
 * cliente) um cliente na Asaas. Quem chama é responsável por não chamar de novo se já tiver
 * `asaas_customer_id` salvo (ver asaasCobranca.ts no domínio do cliente). */
export async function criarClienteAsaas(
  dados: DadosClienteAsaas,
  fetchImpl: FetchLike = fetch,
): Promise<ClienteAsaas> {
  return chamar<ClienteAsaas>(fetchImpl, "POST", "/customers", {
    name: dados.nome,
    cpfCnpj: dados.cpfCnpj,
    email: dados.email,
    mobilePhone: dados.telefone,
  });
}

export type TipoCobrancaAsaas = "BOLETO" | "PIX";

export interface DadosCobrancaAsaas {
  customer: string;
  billingType: TipoCobrancaAsaas;
  value: number;
  dueDate: string;
  description?: string;
  /** Multa por atraso — percentual sobre o valor (ex: `{ value: 2 }` = 2%). A Asaas
   * calcula e cobra isso automaticamente; este sistema nunca recalcula por conta própria
   * (ver cobrancas_asaas.multa_percentual em schema.sql — é um espelho, não a fonte). */
  fine?: { value: number };
  /** Juros de mora — percentual mensal sobre o valor (ex: `{ value: 1 }` = 1%/mês). Mesma
   * observação de `fine`: cálculo e cobrança automáticos, do lado da Asaas. */
  interest?: { value: number };
}

export interface CobrancaAsaas {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  billingType: TipoCobrancaAsaas;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  /** Preenchido só em consultas específicas (ex: GET /payments/{id}/identificationField)
   * na API real — aqui aceito como opcional porque a criação de uma cobrança PIX não
   * devolve a linha digitável de boleto, e vice-versa. */
  identificationField?: string;
  pixQrCodeId?: string;
}

/** POST /payments — cria a cobrança (boleto ou PIX) para um cliente já cadastrado na
 * Asaas. `fine`/`interest`, quando informados, fazem a PRÓPRIA Asaas calcular e cobrar
 * multa/juros de atraso automaticamente — decisão de produto documentada em
 * cobrancas_asaas (schema.sql): este sistema nunca duplica esse cálculo. */
export async function criarCobranca(
  dados: DadosCobrancaAsaas,
  fetchImpl: FetchLike = fetch,
): Promise<CobrancaAsaas> {
  return chamar<CobrancaAsaas>(fetchImpl, "POST", "/payments", dados);
}

/** GET /payments/{id} — status atual de uma cobrança já criada (uso típico: conferência
 * manual, já que o fluxo normal de atualização é o webhook — ver eventos-externos-db.ts). */
export async function consultarCobranca(
  asaasChargeId: string,
  fetchImpl: FetchLike = fetch,
): Promise<CobrancaAsaas> {
  return chamar<CobrancaAsaas>(fetchImpl, "GET", `/payments/${encodeURIComponent(asaasChargeId)}`);
}

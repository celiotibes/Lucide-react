// Cliente HTTP fino para a API legada do ShinePhone (Growatt) —
// autenticação por usuário/senha, self-service (docs/30-auditoria-
// geracao-solar.md). `fetchImpl` é injetável de propósito, mesmo padrão
// de `server/asaas/client.ts`: os testes passam um fetch fake, nunca
// batem na rede.
//
// LIMITAÇÃO HONESTA, mais grave que a do Asaas: não só nunca foi
// executado contra a API real — **não PODE ser testado contra a API real
// neste ambiente**. A política de rede deste sandbox bloqueia
// `server.growatt.com` e `openapi.growatt.com` na camada de proxy (403 —
// "the destination host is not allowed by your organization's egress
// policy for this session"), confirmado tentando as duas diretamente.
// Isso não é falta de credencial (você já passou usuário/senha reais) —
// é uma restrição de rede deste ambiente específico, que persistiria
// mesmo com credencial válida. Os endpoints/campos abaixo vêm da
// biblioteca comunitária `growattServer` (github.com/indykoning/
// PyPi_GrowattServer, engenharia reversa do app, não documentação
// oficial da Growatt) — precisam de validação contra a API real assim
// que este código rodar num ambiente sem esse bloqueio (produção/Vercel,
// ou a própria máquina local de quem for testar).
//
// Endpoints (base https://server.growatt.com/):
//   - login: POST newTwoLoginAPI.do  { userName, password } -> back.user.id
//   - plant_list: GET PlantListAPI.do?userId=... -> back[] (lista de plantas)
//   - plant_energy_data: POST newTwoPlantAPI.do?op=getUserCenterEnertyDataByPlantid
//     { language: 1, plantId } -> geração diária/mensal/total em kWh

export interface GrowattConfig {
  usuario: string;
  senha: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface PlantaGrowatt {
  plantId: string;
  plantName: string;
}

export interface EnergiaDiariaGrowatt {
  data: string; // 'YYYY-MM-DD'
  energiaGeradaKwh: number;
}

export class GrowattApiError extends Error {}

const BASE_URL_PADRAO = 'https://server.growatt.com';

export class GrowattClient {
  private readonly usuario: string;
  private readonly senha: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private userId: string | null = null;
  private cookie: string | null = null;

  constructor(config: GrowattConfig) {
    this.usuario = config.usuario;
    this.senha = config.senha;
    this.baseUrl = config.baseUrl ?? BASE_URL_PADRAO;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async autenticar(): Promise<void> {
    if (this.userId) return;

    const resposta = await this.fetchImpl(`${this.baseUrl}/newTwoLoginAPI.do`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ userName: this.usuario, password: this.senha }).toString(),
    });

    if (!resposta.ok) {
      throw new GrowattApiError(`Falha ao autenticar no ShinePhone: HTTP ${resposta.status}`);
    }

    const corpo = (await resposta.json()) as { back?: { success?: boolean; user?: { id?: string } } };
    if (!corpo.back?.success || !corpo.back.user?.id) {
      throw new GrowattApiError('Login no ShinePhone rejeitado — verifique usuário/senha');
    }

    this.userId = corpo.back.user.id;
    this.cookie = resposta.headers.get('set-cookie');
  }

  async listarPlantas(): Promise<PlantaGrowatt[]> {
    await this.autenticar();

    const resposta = await this.fetchImpl(`${this.baseUrl}/PlantListAPI.do?userId=${encodeURIComponent(this.userId!)}`, {
      headers: this.cookie ? { Cookie: this.cookie } : {},
    });
    if (!resposta.ok) {
      throw new GrowattApiError(`Falha ao listar plantas: HTTP ${resposta.status}`);
    }

    const corpo = (await resposta.json()) as { back?: Array<{ plantId: string; plantName: string }> };
    return (corpo.back ?? []).map((p) => ({ plantId: p.plantId, plantName: p.plantName }));
  }

  /** Geração diária do mês corrente/consultado, em kWh, para uma planta específica. */
  async buscarEnergiaDiaria(plantId: string): Promise<EnergiaDiariaGrowatt[]> {
    await this.autenticar();

    const resposta = await this.fetchImpl(
      `${this.baseUrl}/newTwoPlantAPI.do?op=getUserCenterEnertyDataByPlantid`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
        body: new URLSearchParams({ language: '1', plantId }).toString(),
      },
    );
    if (!resposta.ok) {
      throw new GrowattApiError(`Falha ao buscar energia da planta ${plantId}: HTTP ${resposta.status}`);
    }

    const corpo = (await resposta.json()) as {
      back?: { chartData?: Record<string, string> };
    };
    const pontos = corpo.back?.chartData ?? {};

    return Object.entries(pontos).map(([data, valor]) => ({
      data,
      energiaGeradaKwh: Number(valor),
    }));
  }
}

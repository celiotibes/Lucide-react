/** Configuração do roteador de IA: provedor preferido, rodízio, e de onde vêm as chaves.
 *
 * AVISO DE SEGURANÇA — LEIA ANTES DE MUDAR QUALQUER COISA AQUI.
 *
 * Este app roda inteiro no navegador (Vite). Qualquer variável de ambiente que comece com
 * `VITE_` é embutida em texto plano no JavaScript entregue a quem abrir a página — não é
 * "configuração do servidor", é um valor que qualquer pessoa lê abrindo o DevTools e
 * procurando a string. O código pré-existente (classificarComIA.ts) já usa
 * `VITE_ANTHROPIC_API_KEY` dessa forma: funciona para demonstração local, mas expor a chave
 * de produção assim equivale a publicá-la.
 *
 * O CAMINHO CORRETO, que este módulo prioriza: `enderecoBackend` (mesma ideia que já existia
 * como `VITE_CLASIFICACAO_BACKEND` em classificarComIA.ts, generalizada para os 4
 * provedores). Quando configurado, toda chamada a provedor pago passa por
 * `POST {enderecoBackend}` com `{ provedor, modelo, prompt }` no corpo — um backend próprio
 * (fora do escopo desta tarefa: pertenceria a server/**, que esta tarefa não pode tocar)
 * guarda as chaves reais do lado do servidor e nunca as envia ao navegador. É esse backend
 * que deveria usar os SDKs oficiais de cada provedor com a chave em variável de ambiente
 * server-side (sem prefixo VITE_).
 *
 * QUANDO NÃO HÁ BACKEND CONFIGURADO: o roteador cai para chamar o provedor diretamente do
 * navegador, usando a chave que a pessoa digitou na tela de configuração (ConfiguracaoIA.tsx)
 * — guardada em localStorage do próprio navegador dela. Isto é estritamente melhor que
 * `VITE_*` (a chave não vai para o bundle público, e só existe no navegador de quem a
 * digitou), mas AINDA é inseguro para uso multiusuário/produção: qualquer pessoa com acesso
 * àquele navegador (DevTools, extensão maliciosa, computador compartilhado) lê a chave em
 * `localStorage`. Por isso a tela de configuração exibe o aviso e por isso esta função tem
 * o nome que tem — não chame `obterChaveDoNavegadorInseguro` fora de um contexto que já
 * sabe que está no modo inseguro.
 *
 * Ollama não precisa de chave (roda em localhost) — o único dado sensível ali é o endereço
 * do servidor local, que não é segredo.
 */

import type { IdProvedorIA } from "./tipos";

export interface ConfiguracaoProvedorIA {
  ativo: boolean;
  modelo: string;
  /** Só usada no modo inseguro (sem `enderecoBackend`) — ver aviso acima. */
  apiKey?: string;
  /** Só relevante para Ollama: endereço do servidor local. */
  baseUrl?: string;
}

export interface ConfiguracaoIA {
  preferido: IdProvedorIA;
  /** Ordem de tentativa ao distribuir custo entre provedores pagos — rotaciona a cada
   * chamada para não esgotar a cota de um só (ver roteador.ts). Ollama fica de fora do
   * rodízio: é sempre tentado primeiro, separadamente, por ser o caminho barato. */
  ordemRodizio: IdProvedorIA[];
  provedores: Record<IdProvedorIA, ConfiguracaoProvedorIA>;
  /** Caminho seguro recomendado — ver aviso do arquivo. Vazio = modo inseguro (chave direta
   * do navegador ou VITE_* legado). */
  enderecoBackend?: string;
}

export const CONFIGURACAO_PADRAO: ConfiguracaoIA = {
  preferido: "anthropic",
  ordemRodizio: ["anthropic", "openai", "google"],
  provedores: {
    // Modelos "baratos" de cada família — o dono do produto pode trocar por qualquer outro
    // na tela de configuração; o valor aqui é só o ponto de partida.
    anthropic: { ativo: true, modelo: "claude-haiku-4-5" },
    openai: { ativo: false, modelo: "gpt-4o-mini" },
    google: { ativo: false, modelo: "gemini-2.5-flash" },
    ollama: { ativo: false, modelo: "llama3.2", baseUrl: "http://localhost:11434" },
  },
  enderecoBackend: undefined,
};

const CHAVE_LOCALSTORAGE = "ia:configuracao:v1";

function copiaProfunda<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Lê a configuração salva (localStorage) mesclada com o padrão — nunca falha: erro de leitura
 * (modo privado do navegador, storage bloqueado) só faz voltar ao padrão em memória, do
 * mesmo jeito que outras telas do sistema tratam localStorage indisponível. */
export function carregarConfiguracaoIA(): ConfiguracaoIA {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    if (!bruto) return copiaProfunda(CONFIGURACAO_PADRAO);
    const salva = JSON.parse(bruto) as Partial<ConfiguracaoIA>;
    return {
      ...copiaProfunda(CONFIGURACAO_PADRAO),
      ...salva,
      provedores: { ...copiaProfunda(CONFIGURACAO_PADRAO.provedores), ...(salva.provedores ?? {}) },
    };
  } catch {
    return copiaProfunda(CONFIGURACAO_PADRAO);
  }
}

export function salvarConfiguracaoIA(config: ConfiguracaoIA): void {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(config));
  } catch {
    // Storage bloqueado/cheio — a configuração continua valendo em memória para esta sessão,
    // só não sobrevive a um reload. Não é um erro que justifique quebrar a tela.
  }
}

/** Resolve a chave efetiva de um provedor, na ordem de prioridade descrita no aviso do
 * arquivo: nunca `VITE_*` como primeira opção. `VITE_ANTHROPIC_API_KEY` só é usada como
 * ÚLTIMO fallback, para não quebrar quem já dependia dela antes deste módulo existir — e
 * mesmo assim com o aviso deixado explícito para quem for revisar o código depois. */
export function obterChaveEfetiva(config: ConfiguracaoIA, provedor: IdProvedorIA): string | undefined {
  const direta = config.provedores[provedor]?.apiKey;
  if (direta) return direta;
  if (provedor === "anthropic") {
    // Compat com o comportamento anterior a este módulo (classificarComIA.ts). INSEGURO:
    // ver aviso no topo do arquivo — a chave fica embutida no JavaScript público do build.
    // eslint-disable-next-line no-restricted-syntax
    const legado = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_ANTHROPIC_API_KEY;
    if (legado) return legado;
  }
  return undefined;
}

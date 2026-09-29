/** Cliente HTTP para as rotas de gestão do sistema do backend (`server/`):
 * matriz de permissões (papel × função) e criação de usuário. Mesmo padrão
 * de `src/domain/parsers/pluggyClient.ts` — chama o backend configurado,
 * nunca um serviço de terceiro direto; lança `Error` com mensagem legível em
 * qualquer falha (rede, status HTTP, corpo inesperado), para o componente
 * capturar num try/catch e mostrar um toast. */

export interface DefinicaoFuncao {
  id: string;
  rotulo: string;
  descricao: string;
  suportaLimite: boolean;
}

export interface EntradaPermissao {
  papel: string;
  funcao: string;
  habilitado: boolean;
  limite_valor: number | null;
}

export interface MatrizPermissoesResposta {
  matriz: EntradaPermissao[];
  catalogoFuncoes: DefinicaoFuncao[];
  papeis: string[];
}

export interface UsuarioCriado {
  id: string;
  nome: string;
  email: string;
  role: string;
  ativo: boolean;
}

function cabecalhos(token: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

/** Extrai a mensagem de erro do corpo JSON `{ erro }` da API quando possível;
 * cai para uma mensagem genérica com o status HTTP quando o corpo não é o
 * formato esperado (ex: erro 500 de um proxy no meio do caminho). */
async function mensagemErroResposta(resposta: Response, acaoDescricao: string): Promise<string> {
  try {
    const corpo = await resposta.json();
    if (typeof corpo?.erro === "string") return corpo.erro;
  } catch {
    /* corpo não é JSON — segue para a mensagem genérica abaixo */
  }
  return `${acaoDescricao} (HTTP ${resposta.status})`;
}

export async function buscarMatrizPermissoes(backendUrl: string, token: string): Promise<MatrizPermissoesResposta> {
  const resposta = await fetch(`${backendUrl}/api/auth/permissoes`, { headers: cabecalhos(token) });
  if (!resposta.ok) {
    throw new Error(await mensagemErroResposta(resposta, "Falha ao carregar a matriz de permissões"));
  }
  return resposta.json();
}

export async function salvarMatrizPermissoes(
  backendUrl: string,
  token: string,
  entradas: EntradaPermissao[],
): Promise<EntradaPermissao[]> {
  const resposta = await fetch(`${backendUrl}/api/auth/permissoes`, {
    method: "PUT",
    headers: cabecalhos(token),
    body: JSON.stringify({ entradas }),
  });
  if (!resposta.ok) {
    throw new Error(await mensagemErroResposta(resposta, "Falha ao salvar a matriz de permissões"));
  }
  const corpo: { matriz: EntradaPermissao[] } = await resposta.json();
  return corpo.matriz;
}

export async function criarUsuarioAdmin(
  backendUrl: string,
  token: string,
  dados: { nome: string; email: string; senha: string; role: string },
): Promise<UsuarioCriado> {
  const resposta = await fetch(`${backendUrl}/api/auth/usuarios`, {
    method: "POST",
    headers: cabecalhos(token),
    body: JSON.stringify(dados),
  });
  if (!resposta.ok) {
    throw new Error(await mensagemErroResposta(resposta, "Falha ao criar usuário"));
  }
  const corpo: { usuario: UsuarioCriado } = await resposta.json();
  return corpo.usuario;
}

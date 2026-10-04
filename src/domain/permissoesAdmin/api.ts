/** Cliente HTTP para as rotas de gestão do sistema do backend (`server/`):
 * matriz de permissões (papel × função) e criação de usuário. Usa `apiFetch`
 * (src/api/cliente.ts): sessão por cookie httpOnly + token CSRF, base em
 * `VITE_API_URL` — não há mais token de sessão colado à mão. Lança `Error`
 * com mensagem legível em qualquer falha (rede, status HTTP, corpo
 * inesperado), para o componente capturar num try/catch e mostrar um toast. */
import { apiFetch } from "../../api/cliente";

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

const CABECALHOS_JSON = { "Content-Type": "application/json" };

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

export async function buscarMatrizPermissoes(): Promise<MatrizPermissoesResposta> {
  const resposta = await apiFetch("/api/auth/permissoes");
  if (!resposta.ok) {
    throw new Error(await mensagemErroResposta(resposta, "Falha ao carregar a matriz de permissões"));
  }
  return resposta.json();
}

export async function salvarMatrizPermissoes(
  entradas: EntradaPermissao[],
): Promise<EntradaPermissao[]> {
  const resposta = await apiFetch("/api/auth/permissoes", {
    method: "PUT",
    headers: CABECALHOS_JSON,
    body: JSON.stringify({ entradas }),
  });
  if (!resposta.ok) {
    throw new Error(await mensagemErroResposta(resposta, "Falha ao salvar a matriz de permissões"));
  }
  const corpo: { matriz: EntradaPermissao[] } = await resposta.json();
  return corpo.matriz;
}

export async function criarUsuarioAdmin(
  dados: { nome: string; email: string; senha: string; role: string },
): Promise<UsuarioCriado> {
  const resposta = await apiFetch("/api/auth/usuarios", {
    method: "POST",
    headers: CABECALHOS_JSON,
    body: JSON.stringify(dados),
  });
  if (!resposta.ok) {
    throw new Error(await mensagemErroResposta(resposta, "Falha ao criar usuário"));
  }
  const corpo: { usuario: UsuarioCriado } = await resposta.json();
  return corpo.usuario;
}

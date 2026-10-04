/** LEGADO: a tela de permissões agora usa a sessão por cookie (src/api/cliente.ts + LoginView) e
 * não lê mais este módulo; mantido só enquanto não for removido junto do seu teste.
 *
 * Configuração local da tela de gerenciamento de permissões/usuários
 * (`GerenciamentoPermissoesView`) — mesmo espírito de `src/domain/ia/config.ts`
 * e `src/components/ConectarPluggy.tsx`: nada aqui é gravado no banco sql.js
 * da contabilidade (nem poderia — a tabela `permissoes_papel` vive no
 * backend `server/`, não no client). Persistido em `localStorage` deste
 * navegador, por ser só uma conveniência de "para onde apontar" e "com qual
 * sessão", não dado de negócio.
 *
 * Esta tela consome duas rotas novas do backend (`GET`/`PUT
 * /api/auth/permissoes`, `POST /api/auth/usuarios`), reservadas a
 * titular/administrador — por isso, além do endereço do backend, também
 * guardamos o TOKEN de sessão Bearer de quem vai chamar essas rotas. Não há,
 * nesta tarefa, uma tela de login própria no client (fora do escopo — outra
 * tarefa liga a navegação); quem for usar esta tela precisa ter feito login
 * por outro meio (ex: `POST /api/auth/login` via curl/Postman, ou uma tela
 * de login que venha a existir depois) e colar o token aqui. Mesmo aviso de
 * segurança que já vale para a chave de IA/Pluggy: um token em
 * `localStorage` é legível por qualquer um com acesso a este navegador.
 */

export interface ConfiguracaoPermissoesAdmin {
  /** Vazio = sem backend configurado — ver `backendConfigurado()`. */
  enderecoBackend: string;
  /** Token de sessão (Bearer) de um usuário titular/administrador — obtido
   * via POST /api/auth/login, fora desta tela. */
  tokenSessao: string;
}

const CHAVE_LOCALSTORAGE = "permissoes-admin:config:v1";

const CONFIGURACAO_PADRAO: ConfiguracaoPermissoesAdmin = {
  enderecoBackend: "",
  tokenSessao: "",
};

/** Nunca falha: erro de leitura (modo privado, storage bloqueado) só faz
 * voltar ao padrão em memória — mesmo princípio de `carregarConfiguracaoIA`. */
export function carregarConfiguracaoPermissoesAdmin(): ConfiguracaoPermissoesAdmin {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    if (!bruto) return { ...CONFIGURACAO_PADRAO };
    const salva = JSON.parse(bruto) as Partial<ConfiguracaoPermissoesAdmin>;
    return { ...CONFIGURACAO_PADRAO, ...salva };
  } catch {
    return { ...CONFIGURACAO_PADRAO };
  }
}

export function salvarConfiguracaoPermissoesAdmin(config: ConfiguracaoPermissoesAdmin): void {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(config));
  } catch {
    // Storage bloqueado/cheio — a configuração continua valendo em memória
    // para esta sessão, só não sobrevive a um reload.
  }
}

export function backendConfigurado(config: ConfiguracaoPermissoesAdmin): boolean {
  return config.enderecoBackend.trim().length > 0;
}

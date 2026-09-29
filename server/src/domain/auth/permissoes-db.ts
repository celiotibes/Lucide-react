/**
 * Serviço com banco para a matriz de permissões configurável (papel × função)
 * Ver permissoes.ts para o catálogo de funções, tipos e validação pura.
 */
import type Database from "better-sqlite3";
import type { ContextoAutenticacao } from "./auth-service.js";
import {
  FUNCAO_PROTEGIDA,
  PAPEIS_COM_FUNCAO_PROTEGIDA,
  validarEntradaPermissao,
  type EntradaPermissao,
  type UserRole,
} from "./permissoes.js";

interface LinhaPermissao {
  papel: UserRole;
  funcao: string;
  habilitado: number | boolean;
  limite_valor: number | null;
}

function paraEntrada(linha: LinhaPermissao): EntradaPermissao {
  return {
    papel: linha.papel,
    funcao: linha.funcao,
    habilitado: !!linha.habilitado,
    limite_valor: linha.limite_valor,
  };
}

export interface ResultadoAtualizarMatriz {
  sucesso: boolean;
  erro?: string;
  /** Só preenchido em sucesso — usado pela rota para montar o evento de
   * auditoria (valores_antigos/valores_novos), sem duplicar a lógica de
   * "o que mudou" na camada HTTP. */
  entradasAntigas?: EntradaPermissao[];
  entradasNovas?: EntradaPermissao[];
}

export class PermissoesServiceDB {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  /** Matriz completa (todas as combinações papel × função já seedadas no
   * boot — ver `matrizPadrao()`/`database-init.ts`). Não filtra por
   * permissão de quem chama: a rota HTTP já exige titular/administrador
   * ANTES de chegar aqui (ver auth-routes.ts). */
  obterMatriz(): EntradaPermissao[] {
    const linhas = this.db
      .prepare("SELECT papel, funcao, habilitado, limite_valor FROM permissoes_papel ORDER BY papel, funcao")
      .all() as LinhaPermissao[];
    return linhas.map(paraEntrada);
  }

  private obterEntrada(papel: UserRole, funcao: string): EntradaPermissao | null {
    const linha = this.db
      .prepare("SELECT papel, funcao, habilitado, limite_valor FROM permissoes_papel WHERE papel = ? AND funcao = ?")
      .get(papel, funcao) as LinhaPermissao | undefined;
    return linha ? paraEntrada(linha) : null;
  }

  /**
   * Aplica um lote de entradas à matriz (upsert por `(papel, funcao)`).
   * Entradas não incluídas no payload permanecem com o valor atual —
   * `entradasBrutas` não precisa ser a grade inteira a cada chamada.
   *
   * Validação em duas etapas, ANTES de qualquer escrita:
   *   1) cada entrada, isoladamente (papel/função válidos, tipos corretos,
   *      `limite_valor` só quando a função suporta) — `validarEntradaPermissao`;
   *   2) a invariante de proteção contra autotravamento: depois de aplicar
   *      TODO o lote, `gerenciar_permissoes` precisa continuar habilitada
   *      para `titular` E para `administrador` — se o payload deixaria
   *      qualquer um dos dois sem essa função, a chamada inteira é recusada
   *      (nenhuma entrada é gravada, nem as que não violam nada) — um
   *      titular/administrador não tem como remover essa capacidade nem de
   *      si mesmo nem do outro papel de gestão, exatamente o requisito de
   *      "nunca travar o sistema sem saída".
   *
   * Roda dentro de uma transação (`db.transaction`) — better-sqlite3 a
   * serializa, então duas chamadas concorrentes não podem intercalar suas
   * escritas de um jeito que burle a invariante acima.
   */
  atualizarMatriz(entradasBrutas: unknown, contexto: ContextoAutenticacao): ResultadoAtualizarMatriz {
    if (!Array.isArray(entradasBrutas) || entradasBrutas.length === 0) {
      return { sucesso: false, erro: "Envie um array não vazio de entradas" };
    }
    if (entradasBrutas.length > 200) {
      return { sucesso: false, erro: "Máximo de 200 entradas por chamada" };
    }

    for (const entrada of entradasBrutas) {
      const erro = validarEntradaPermissao(entrada);
      if (erro) {
        return { sucesso: false, erro };
      }
    }
    const entradas = entradasBrutas as EntradaPermissao[];

    // Duplicatas dentro do MESMO payload (mesma papel+função repetida com
    // valores diferentes) tornariam o resultado dependente da ordem de
    // iteração — recusado explicitamente em vez de aplicar "a última que
    // apareceu" silenciosamente.
    const chaves = new Set<string>();
    for (const e of entradas) {
      const chave = `${e.papel}::${e.funcao}`;
      if (chaves.has(chave)) {
        return { sucesso: false, erro: `Entrada duplicada no payload: ${e.papel} / ${e.funcao}` };
      }
      chaves.add(chave);
    }

    const porChave = new Map(entradas.map((e) => [`${e.papel}::${e.funcao}`, e]));

    // Invariante: gerenciar_permissoes precisa continuar true para
    // titular E administrador no estado FINAL (payload aplicado sobre o
    // estado atual do banco) — checado ANTES de escrever qualquer coisa.
    for (const papelProtegido of PAPEIS_COM_FUNCAO_PROTEGIDA) {
      const chave = `${papelProtegido}::${FUNCAO_PROTEGIDA}`;
      const noPayload = porChave.get(chave);
      const habilitadoFinal = noPayload
        ? noPayload.habilitado
        : (this.obterEntrada(papelProtegido, FUNCAO_PROTEGIDA)?.habilitado ?? false);
      if (!habilitadoFinal) {
        return {
          sucesso: false,
          erro:
            `Não é permitido desabilitar '${FUNCAO_PROTEGIDA}' para '${papelProtegido}' — isso tiraria de ` +
            `titular/administrador a capacidade de corrigir a própria matriz de permissões depois.`,
        };
      }
    }

    const entradasAntigas: EntradaPermissao[] = [];
    for (const e of entradas) {
      entradasAntigas.push(
        this.obterEntrada(e.papel, e.funcao) ?? { papel: e.papel, funcao: e.funcao, habilitado: false, limite_valor: null },
      );
    }

    try {
      const usuarioId = contexto.usuario?.id ?? null;
      const executar = this.db.transaction(() => {
        const upsert = this.db.prepare(
          `INSERT INTO permissoes_papel (papel, funcao, habilitado, limite_valor, atualizado_em, atualizado_por)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
           ON CONFLICT(papel, funcao) DO UPDATE SET
             habilitado = excluded.habilitado,
             limite_valor = excluded.limite_valor,
             atualizado_em = excluded.atualizado_em,
             atualizado_por = excluded.atualizado_por`,
        );
        for (const e of entradas) {
          upsert.run(e.papel, e.funcao, e.habilitado ? 1 : 0, e.limite_valor ?? null, usuarioId);
        }
      });
      executar();

      return { sucesso: true, entradasAntigas, entradasNovas: entradas };
    } catch (erro) {
      return {
        sucesso: false,
        erro: erro instanceof Error ? erro.message : "Erro ao atualizar matriz de permissões",
      };
    }
  }
}

/**
 * Parser para arquivos MT940 (SWIFT)
 *
 * Formato padrão em bancos europeus e brasileiros (Bradesco, BB, etc)
 *
 * Estrutura:
 * :20: - Reference (TRN)
 * :25: - Account identification
 * :28C: - Statement number/sequence
 * :60a: - Opening balance
 * :61: - Statement line (transação)
 * :86: - Supplementary details (descrição)
 * :62a: - Closing balance
 *
 * Exemplo:
 * :20:0000001
 * :25:BR0000000000001234567890AB
 * :28C:00001/1
 * :60F:231201BRL1000.00
 * :61:231202D1500.00NMSCNONREF//TXN001
 * :86:120-COMPRA NO DÉBITO
 * :62F:231202BRL500.00
 */

import { ParserBase } from "./parser-base.js";
import type { TransacaoBruta, ParserResult, ParserOptions } from "../tipos.js";

interface MT940Statement {
  referencia: string;
  conta: string;
  numeroExtrato: string;
  saldoAbertura: {
    data: string;
    valor: number;
    moeda: string;
    tipo: "D" | "C"; // Debit or Credit
  };
  transacoes: MT940Transaction[];
  saldoFechamento: {
    data: string;
    valor: number;
    moeda: string;
    tipo: "D" | "C";
  };
}

interface MT940Transaction {
  data: string;
  dataValor: string;
  tipo: "D" | "C";
  valor: number;
  moeda: string;
  referencia: string;
  descricao: string;
  detalhes?: string;
}

export class MT940Parser extends ParserBase {
  info = {
    nome: "MT940 (SWIFT)",
    descricao: "Parser para extratos bancários em formato SWIFT MT940",
    versoes_suportadas: ["1.0"],
    formatos_entrada: ["mt940", "txt"],
  };

  pode_processar(conteudo: string): boolean {
    // Detecta padrão MT940 pelas tags características
    return (
      /^:20:/.test(conteudo) || // Reference
      /^:25:/.test(conteudo) || // Account
      /^:28C:/.test(conteudo) || // Statement number
      /^:60[aF]:/.test(conteudo) || // Opening balance
      /^:61:/.test(conteudo) // Transaction line
    );
  }

  async parse(
    conteudo: string,
    options: ParserOptions = {},
  ): Promise<ParserResult> {
    const resultado = this.criarResultadoVazio();
    resultado.avisos?.push("Processando MT940 (SWIFT)");

    const origem = options.origem || "mt940";

    try {
      // Dividir em statements (separados por :20:)
      const statements = this.extrairStatements(conteudo);

      if (statements.length === 0) {
        resultado.avisos?.push("Nenhum extrato válido encontrado em MT940");
        return resultado;
      }

      // Processar cada statement
      let numeroTransacao = 0;
      for (const stmt of statements) {
        try {
          const transacoesStatement = stmt.transacoes;

          if (options.maxLinhas && numeroTransacao >= options.maxLinhas) {
            break;
          }

          for (const trn of transacoesStatement) {
            if (options.maxLinhas && numeroTransacao >= options.maxLinhas) {
              break;
            }

            try {
              // Validar data
              if (!trn.data) {
                throw new Error("Data não encontrada");
              }

              if (trn.valor === null || trn.valor === undefined) {
                throw new Error("Valor não encontrado");
              }

              // Normalizar data
              const dataNormalizada = this.normalizarData(trn.data);
              if (!dataNormalizada) {
                throw new Error(`Data inválida: "${trn.data}"`);
              }

              // Normalizar valor
              const valorNormalizado = Math.abs(trn.valor);

              // Determinar tipo
              let tipoTransacao: "entrada" | "saida" = "saida";
              if (trn.tipo === "C") {
                tipoTransacao = "entrada";
              } else if (trn.tipo === "D") {
                tipoTransacao = "saida";
              }

              // Criar transação normalizada
              const transacao: TransacaoBruta = {
                data: dataNormalizada,
                valor: valorNormalizado,
                descricao: this.normalizarDescricao(
                  trn.descricao || "Transação MT940",
                ),
                tipo_transacao: tipoTransacao,
                origem_modulo: origem,
                numero_linha: numeroTransacao + 1,
                campos_adicionais: {
                  referencia: trn.referencia,
                  moeda: trn.moeda,
                  data_valor: trn.dataValor,
                  documento: this.extrairDocumento(trn.descricao || ""),
                  detalhes: trn.detalhes,
                },
              };

              resultado.transacoes.push(transacao);
              resultado.estatisticas!.linhas_processadas++;
            } catch (erro) {
              resultado.estatisticas!.linhas_com_erro++;
              resultado.erros.push({
                linha: numeroTransacao + 1,
                motivo:
                  erro instanceof Error ? erro.message : String(erro),
                valor_original: JSON.stringify(trn).substring(0, 100),
              });

              if (!options.tolerarErros) {
                throw erro;
              }
            }

            numeroTransacao++;
          }
        } catch (erro) {
          if (!options.tolerarErros) {
            throw erro;
          }
        }
      }

      resultado.estatisticas!.total_linhas = numeroTransacao;
      resultado.linhas_descartadas =
        resultado.estatisticas!.total_linhas -
        resultado.estatisticas!.linhas_processadas;
      resultado.sucesso = resultado.transacoes.length > 0;
    } catch (erro) {
      resultado.erros.push({
        linha: 0,
        motivo: `Erro crítico ao processar MT940: ${erro instanceof Error ? erro.message : String(erro)}`,
      });
    }

    return resultado;
  }

  /**
   * Extrai statements do conteúdo MT940
   * Cada statement começa com :20: (reference)
   */
  private extrairStatements(conteudo: string): MT940Statement[] {
    const statements: MT940Statement[] = [];

    // Dividir por statements (cada um começa com :20:)
    const stmtMatches = conteudo.split(/(?=:20:)/);

    for (const stmtText of stmtMatches) {
      if (!stmtText.trim()) continue;

      try {
        const stmt = this.parseStatement(stmtText);
        if (stmt && stmt.transacoes.length > 0) {
          statements.push(stmt);
        }
      } catch (erro) {
        // Ignorar statements inválidos se tolerarErros
        console.error("Erro ao processar statement:", erro);
      }
    }

    return statements;
  }

  /**
   * Faz parse de um statement individual
   */
  private parseStatement(texto: string): MT940Statement | null {
    const stmt: Partial<MT940Statement> = {
      referencia: "",
      conta: "",
      numeroExtrato: "",
      transacoes: [],
    };

    // Extrair linhas
    const linhas = texto.split("\n").filter((l) => l.trim());

    let i = 0;
    let ultimaTag = "";

    while (i < linhas.length) {
      const linha = linhas[i];

      // Detectar tag (formato :XX: ou :XXX:)
      const tagMatch = linha.match(/^:(\d+[A-Z]*)[a-z]?:/);
      if (tagMatch) {
        ultimaTag = tagMatch[1];
        const conteudo = linha.substring(tagMatch[0].length).trim();

        switch (ultimaTag) {
          case "20":
            stmt.referencia = conteudo;
            break;

          case "25":
            stmt.conta = conteudo;
            break;

          case "28C":
            stmt.numeroExtrato = conteudo;
            break;

          case "60a":
          case "60F":
            const saldoAb = this.parsarSaldo(conteudo);
            stmt.saldoAbertura = saldoAb;
            break;

          case "61":
            // Transação pode ter continuação em :86:
            const trn = this.parsarLinhaTransacao(conteudo);
            // Procurar por :86: na próxima linha
            if (i + 1 < linhas.length && linhas[i + 1].startsWith(":86:")) {
              i++;
              trn.descricao = linhas[i]
                .substring(4)
                .trim()
                .replace(/\s+/g, " ");
            }
            stmt.transacoes!.push(trn);
            break;

          case "62a":
          case "62F":
            const saldoFech = this.parsarSaldo(conteudo);
            stmt.saldoFechamento = saldoFech;
            break;

          case "86":
            // Detalhes da transação anterior
            if (stmt.transacoes!.length > 0) {
              stmt.transacoes![stmt.transacoes!.length - 1].detalhes = conteudo
                .trim()
                .replace(/\s+/g, " ");
            }
            break;
        }
      }

      i++;
    }

    return stmt.transacoes && stmt.transacoes.length > 0
      ? (stmt as MT940Statement)
      : null;
  }

  /**
   * Faz parse de linha de transação
   * Formato: DTDTCCDDVVVV,VVC...
   * Ex: 2312021202C1500.00NMSCNONREF//TXN001
   *
   * DT = Data de lançamento (YYMMDD)
   * DT = Data de valor (YYMMDD, opcional)
   * C/D = Crédito/Débito
   * VVVV,VV = Valor
   * C = Código
   * NONREF = Referência do banco
   * ... = Referência do cliente
   */
  private parsarLinhaTransacao(linha: string): MT940Transaction {
    const trn: Partial<MT940Transaction> = {
      referencia: "",
      descricao: "",
    };

    // Data de lançamento (6 dígitos)
    const data = linha.substring(0, 6);
    trn.data = this.normalizarData(data) || data;

    let offset = 6;

    // Verificar data de valor (se houver 6 dígitos antes do tipo)
    if (/^[0-9]{6}[DC]/.test(linha.substring(offset))) {
      const dataValor = linha.substring(offset, offset + 6);
      trn.dataValor = this.normalizarData(dataValor) || dataValor;
      offset += 6;
    } else {
      trn.dataValor = trn.data;
    }

    // Tipo (D ou C)
    const tipo = linha.substring(offset, offset + 1);
    trn.tipo = (tipo === "D" || tipo === "C" ? tipo : "D") as "D" | "C";
    offset += 1;

    // Moeda (3 caracteres)
    const moeda = linha.substring(offset, offset + 3);
    trn.moeda = moeda.match(/^[A-Z]{3}/) ? moeda : "BRL";
    offset += 3;

    // Valor (restante até referência)
    // Formato: XXXXX,XX (pode ter ponto de milhar)
    const restante = linha.substring(offset);
    const valorMatch = restante.match(
      /^(\d+(?:[.,]\d+)?)(.*)/,
    );
    if (valorMatch) {
      trn.valor = this.normalizarValor(valorMatch[1]) || 0;
      const ref = valorMatch[2].trim();

      // Referência do banco (após caracteres de código)
      // Geralmente: NONREF//XXXXX
      if (ref.includes("//")) {
        const partes = ref.split("//");
        trn.referencia = partes[1] || partes[0];
      } else {
        trn.referencia = ref.substring(0, 16); // Primeiros 16 caracteres
      }
    }

    return trn as MT940Transaction;
  }

  /**
   * Faz parse de saldo
   * Formato: DTCCVVVVVV,VV
   * DT = Data (YYMMDD)
   * C = Código (D/C)
   * VV... = Valor
   */
  private parsarSaldo(conteudo: string) {
    const resultado = {
      data: "",
      valor: 0,
      moeda: "BRL",
      tipo: "D" as "D" | "C",
    };

    // Data (6 dígitos)
    if (conteudo.length >= 6) {
      resultado.data = this.normalizarData(conteudo.substring(0, 6)) || "";
    }

    // Tipo (D/C)
    if (conteudo.length >= 7) {
      const tipo = conteudo.substring(6, 7);
      resultado.tipo = tipo === "C" ? "C" : "D";
    }

    // Moeda (3 caracteres)
    if (conteudo.length >= 10) {
      const moeda = conteudo.substring(7, 10);
      resultado.moeda = moeda.match(/^[A-Z]{3}/) ? moeda : "BRL";
    }

    // Valor (restante)
    if (conteudo.length > 10) {
      const valorStr = conteudo.substring(10);
      resultado.valor = this.normalizarValor(valorStr) || 0;
    }

    return resultado;
  }
}

/**
 * Função síncrona de parse para compatibilidade
 */
export function parseMT940(
  conteudo: string,
  options: ParserOptions = {},
): ParserResult {
  const parser = new MT940Parser();
  // Executar de forma síncrona (await será feito pelo chamador)
  return parser.parse(conteudo, options) as unknown as ParserResult;
}

/**
 * Preview do MT940
 */
export function previewMT940(
  conteudo: string,
  linhasPreview: number = 10,
): Promise<ParserResult> {
  return new MT940Parser().parse(conteudo, {
    maxLinhas: linhasPreview,
  });
}

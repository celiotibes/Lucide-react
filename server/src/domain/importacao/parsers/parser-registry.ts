/**
 * Registry de parsers
 *
 * Responsável por:
 * - Detectar formato automaticamente
 * - Selecionar parser apropriado
 * - Fornecer interface unificada de parsing
 */

import type { ParserResult, ParserOptions } from "../tipos.js";
import type { IParser } from "./parser-base.js";

/**
 * Registry singleton para parsers disponíveis
 */
export class ParserRegistry {
  private static instance: ParserRegistry;
  private static initPromise: Promise<void> | null = null;
  private parsers: Map<string, IParser> = new Map();
  private detectores: Array<{
    detector: (conteudo: string, extensao?: string) => boolean;
    parser: IParser;
  }> = [];
  private inicializado = false;

  private constructor() {
    // Constructor vazio - inicialização é feita em inicializarParsers()
  }

  /**
   * Obter instância singleton (sincronizado)
   */
  static getInstance(): ParserRegistry {
    if (!ParserRegistry.instance) {
      ParserRegistry.instance = new ParserRegistry();
      // Inicializar de forma lazy na primeira tentativa de uso
      ParserRegistry.instance.inicializarParsersSync();
    }
    return ParserRegistry.instance;
  }

  /**
   * Obter instância singleton com garantia de inicialização assíncrona
   */
  static async getInstanceAsync(): Promise<ParserRegistry> {
    const instance = ParserRegistry.getInstance();
    if (!instance.inicializado) {
      await instance.inicializarParsers();
    }
    return instance;
  }

  /**
   * Inicialização síncrona (cria placeholders vazios para parsers não carregados ainda)
   */
  private inicializarParsersSync(): void {
    if (this.inicializado) return;

    // Registrar placeholder vazio que será substituído pela inicialização assíncrona
    this.registrarParser("csv", {
      pode_processar: (conteudo, ext) => {
        if (ext?.toLowerCase().endsWith(".csv")) return true;
        return /^[^:]*,/.test(conteudo.split("\n")[0]);
      },
      parse: async () => ({
        sucesso: false,
        transacoes: [],
        erros: [{ linha: 0, motivo: "Parser CSV ainda não carregado" }],
        linhas_descartadas: 0,
      }),
      info: {
        nome: "CSV",
        descricao: "Parser para arquivos CSV",
        versoes_suportadas: ["1.0"],
        formatos_entrada: ["csv"],
      },
    });

    this.registrarParser("ofx", {
      pode_processar: (conteudo) => {
        return /^OFXHEADER|<?[?]xml/.test(conteudo) || /<OFX>|<ofx>/i.test(conteudo);
      },
      parse: async () => ({
        sucesso: false,
        transacoes: [],
        erros: [{ linha: 0, motivo: "Parser OFX ainda não carregado" }],
        linhas_descartadas: 0,
      }),
      info: {
        nome: "OFX",
        descricao: "Parser para Open Financial Exchange",
        versoes_suportadas: ["1.x", "2.x"],
        formatos_entrada: ["ofx"],
      },
    });

    this.registrarParser("mt940", {
      pode_processar: () => false,
      parse: async () => ({
        sucesso: false,
        transacoes: [],
        erros: [{ linha: 0, motivo: "Parser MT940 ainda não carregado" }],
        linhas_descartadas: 0,
      }),
      info: {
        nome: "MT940",
        descricao: "Parser para MT940",
        versoes_suportadas: ["1.0"],
        formatos_entrada: ["mt940"],
      },
    });

    // Iniciar carregamento assíncrono em background
    this.inicializarParsers().catch((erro) => {
      console.error("Erro ao inicializar parsers:", erro);
    });
  }

  /**
   * Inicializar parsers disponíveis (carregamento dinâmico assíncrono)
   */
  private async inicializarParsers() {
    if (this.inicializado) return;

    try {
      // Importações dinâmicas dos parsers
      const [
        csvModule,
        ofxModule,
        mt940Module,
      ] = await Promise.all([
        import("./csv-parser"),
        import("./ofx-parser"),
        import("./mt940-parser"),
      ]);

      const { parseCSV } = csvModule;
      const { parseOFX } = ofxModule;
      const { MT940Parser } = mt940Module;

      // Limpar e re-registrar parsers reais
      this.parsers.clear();
      this.detectores = [];

      this.registrarParser("csv", {
        pode_processar: (conteudo, ext) => {
          if (ext?.toLowerCase().endsWith(".csv")) return true;
          return /^[^:]*,/.test(conteudo.split("\n")[0]);
        },
        parse: (conteudo, options) =>
          Promise.resolve(parseCSV(conteudo, options)),
        info: {
          nome: "CSV",
          descricao: "Parser para arquivos CSV com variações por banco",
          versoes_suportadas: ["1.0"],
          formatos_entrada: ["csv"],
        },
      });

      this.registrarParser("ofx", {
        pode_processar: (conteudo) => {
          return /^OFXHEADER|<?[?]xml/.test(conteudo) || /<OFX>|<ofx>/i.test(conteudo);
        },
        parse: (conteudo, options) =>
          Promise.resolve(parseOFX(conteudo, options)),
        info: {
          nome: "OFX",
          descricao: "Parser para Open Financial Exchange (OFX 1.x e 2.x)",
          versoes_suportadas: ["1.x", "2.x"],
          formatos_entrada: ["ofx"],
        },
      });

      this.registrarParser("mt940", new MT940Parser());

      this.inicializado = true;
    } catch (erro) {
      console.error("Erro ao inicializar parsers:", erro instanceof Error ? erro.message : erro);
      this.inicializado = true; // Marcar como tentado, mesmo com erro
    }
  }

  /**
   * Verificar se registry está inicializado
   */
  estaInicializado(): boolean {
    return this.inicializado;
  }

  /**
   * Forçar inicialização assíncrona (público)
   */
  async inicializarAsync(): Promise<void> {
    return this.inicializarParsers();
  }

  /**
   * Registrar um novo parser
   */
  registrarParser(chave: string, parser: IParser): void {
    this.parsers.set(chave, parser);
    this.detectores.push({
      detector: (conteudo, ext) => parser.pode_processar(conteudo, ext),
      parser,
    });
  }

  /**
   * Detectar tipo de arquivo automaticamente
   */
  detectarTipo(
    conteudo: string,
    extensao?: string,
  ): { tipo: string; parser: IParser; confianca: number } | null {
    const resultados: Array<{
      tipo: string;
      parser: IParser;
      confianca: number;
    }> = [];

    // Tentar cada parser
    for (const [tipo, parser] of this.parsers) {
      let confianca = 0;

      // Verificação por extensão (alta confiança)
      if (extensao) {
        const ext = extensao.toLowerCase().replace(/^\./, "");
        if (parser.info.formatos_entrada.includes(ext)) {
          confianca = 90;
        }
      }

      // Verificação por conteúdo
      if (parser.pode_processar(conteudo, extensao)) {
        confianca = Math.max(confianca, 80);
      }

      if (confianca > 0) {
        resultados.push({ tipo, parser, confianca });
      }
    }

    // Retornar com maior confiança
    resultados.sort((a, b) => b.confianca - a.confianca);
    return resultados[0] || null;
  }

  /**
   * Obter parser por chave
   */
  obterParser(chave: string): IParser | null {
    return this.parsers.get(chave) || null;
  }

  /**
   * Listar parsers disponíveis
   */
  listarParsers(): Array<{
    chave: string;
    info: {
      nome: string;
      descricao: string;
      versoes_suportadas: string[];
      formatos_entrada: string[];
    };
  }> {
    return Array.from(this.parsers).map(([chave, parser]) => ({
      chave,
      info: parser.info,
    }));
  }

  /**
   * Parse unificado - detecta e processa automaticamente
   */
  async parse(
    conteudo: string,
    opcoes?: {
      extensao?: string;
      parserForçado?: string;
      options?: ParserOptions;
    },
  ): Promise<ParserResult> {
    // Se parser forçado, usar direto
    if (opcoes?.parserForçado) {
      const parser = this.obterParser(opcoes.parserForçado);
      if (!parser) {
        return {
          sucesso: false,
          transacoes: [],
          erros: [
            {
              linha: 0,
              motivo: `Parser "${opcoes.parserForçado}" não encontrado`,
            },
          ],
          linhas_descartadas: 0,
          avisos: ["Parser forçado não está disponível"],
        };
      }
      return parser.parse(conteudo, opcoes.options);
    }

    // Detectar automaticamente
    const deteccao = this.detectarTipo(conteudo, opcoes?.extensao);

    if (!deteccao) {
      return {
        sucesso: false,
        transacoes: [],
        erros: [
          {
            linha: 0,
            motivo: "Não foi possível detectar o formato do arquivo",
          },
        ],
        linhas_descartadas: 0,
        avisos: [
          `Extensão fornecida: ${opcoes?.extensao || "desconhecida"}`,
          "Tente especificar o parserForçado ou renomear o arquivo com extensão correta",
        ],
      };
    }

    // Usar parser detectado
    const resultado = await deteccao.parser.parse(
      conteudo,
      opcoes?.options || { origem: deteccao.tipo },
    );

    // Adicionar informações de detecção
    resultado.avisos?.unshift(
      `Formato detectado: ${deteccao.tipo} (confiança: ${deteccao.confianca}%)`,
    );

    return resultado;
  }
}

/**
 * Instância global singleton
 */
let registryInstance: ParserRegistry | null = null;

/**
 * Obter registry global (retorna instância, inicializa em background)
 */
export function obterRegistry(): ParserRegistry {
  if (!registryInstance) {
    registryInstance = ParserRegistry.getInstance();
  }
  return registryInstance;
}

/**
 * Obter registry global com garantia de inicialização (async)
 */
export async function obterRegistryAsync(): Promise<ParserRegistry> {
  if (!registryInstance) {
    registryInstance = await ParserRegistry.getInstanceAsync();
  } else if (!registryInstance.estaInicializado()) {
    await registryInstance.inicializarAsync();
  }
  return registryInstance;
}

/**
 * Parse unificado direto (sem criar instância)
 */
export async function parseArquivo(
  conteudo: string,
  opcoes?: {
    extensao?: string;
    parserForçado?: string;
    options?: ParserOptions;
  },
): Promise<ParserResult> {
  const registry = await obterRegistryAsync();
  return registry.parse(conteudo, opcoes);
}

/**
 * Detectar tipo de arquivo
 */
export function detectarFormato(
  conteudo: string,
  extensao?: string,
): { tipo: string; confianca: number } | null {
  const resultado = obterRegistry().detectarTipo(conteudo, extensao);
  return resultado
    ? { tipo: resultado.tipo, confianca: resultado.confianca }
    : null;
}

/**
 * Listar formatos suportados
 */
export function listarFormatosSuportados(): Array<{
  chave: string;
  nome: string;
  descricao: string;
  extensoes: string[];
}> {
  return obterRegistry()
    .listarParsers()
    .map((p) => ({
      chave: p.chave,
      nome: p.info.nome,
      descricao: p.info.descricao,
      extensoes: p.info.formatos_entrada,
    }));
}

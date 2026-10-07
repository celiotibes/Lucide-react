/**
 * Serviço de Verificação de Registro de Agentes Econômicos
 *
 * Responsabilidades:
 * - Validar CNPJ contra bases públicas (Receita Federal)
 * - Validar CPF contra registro de pessoas físicas
 * - Detectar duplicatas de tax ID
 * - Buscar informações de empresas em órgãos públicos
 * - Verificar listas de sanções (OFAC)
 * - Auditoria de todas as verificações
 */

import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import {
  TipoEntidade,
  TipoValidacao,
  ResultadoValidacao,
  cpfValido,
  cnpjValido,
  cleanCPFCNPJ,
  formatCPF,
  formatCNPJ,
  AgenteEconomico,
  ValidacaoAgente,
} from "./agentes-tipos";

/**
 * Resultado de verificação de CNPJ/CPF
 */
export interface ResultadoVerificacao {
  valido: boolean;
  nomeEmpresa?: string;
  situacao?: string; // ativo, cancelado, inapto, etc
  dataConstituicao?: string;
  dataUltimaAtualizacao?: string;
  detalhes?: Record<string, any>;
  erro?: string;
  fonte?: string;
}

/**
 * Resultado de detecção de duplicata
 */
export interface DuplicataDetectada {
  agente_id_existente: string;
  cpf_cnpj_existente: string;
  score_similaridade: number;
  motivos: string[];
}

/**
 * Serviço de verificação de registros
 */
export class AgenteRegistryService {
  constructor(private db: Database.Database) {}

  /**
   * Verifica CNPJ em base pública (Receita Federal)
   * Implementação básica com simulação de consulta
   * @param cnpj - CNPJ a verificar (14 dígitos)
   * @returns Resultado da verificação
   */
  async verifySoleCNPJ(cnpj: string): Promise<ResultadoVerificacao> {
    const validacao = cnpjValido(cnpj);

    if (!validacao.valido) {
      return {
        valido: false,
        erro: validacao.erro,
        fonte: "validação_local",
      };
    }

    const limpo = validacao.cnpjLimpo!;

    // Registra tentativa de verificação
    this.registrarTentativaVerificacao({
      tipo: "cnpj_receita_federal",
      cnpj_cnpj: limpo,
      resultado: "iniciada",
    });

    try {
      // Simula consulta à Receita Federal
      // Em produção, integrar com API real da RF
      const resultado = await this.consultarReceitaFederal(limpo);

      // Registra resultado
      this.registrarTentativaVerificacao({
        tipo: "cnpj_receita_federal",
        cnpj_cnpj: limpo,
        resultado: resultado.valido ? "sucesso" : "falha",
        detalhes: resultado,
      });

      return resultado;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";

      this.registrarTentativaVerificacao({
        tipo: "cnpj_receita_federal",
        cnpj_cnpj: limpo,
        resultado: "erro",
        erro: mensagem,
      });

      return {
        valido: false,
        erro: `Erro ao verificar CNPJ: ${mensagem}`,
        fonte: "receita_federal",
      };
    }
  }

  /**
   * Verifica CPF em base pública
   * Implementação básica com simulação
   * @param cpf - CPF a verificar (11 dígitos)
   * @returns Resultado da verificação
   */
  async verifySoleCPF(cpf: string): Promise<ResultadoVerificacao> {
    const validacao = cpfValido(cpf);

    if (!validacao.valido) {
      return {
        valido: false,
        erro: validacao.erro,
        fonte: "validação_local",
      };
    }

    const limpo = validacao.cpfLimpo!;

    // Registra tentativa de verificação
    this.registrarTentativaVerificacao({
      tipo: "cpf_receita_federal",
      cnpj_cnpj: limpo,
      resultado: "iniciada",
    });

    try {
      // Simula consulta a banco de CPF
      // Em produção, integrar com API real (RFB, Serpro, etc)
      const resultado = await this.consultarCPF(limpo);

      // Registra resultado
      this.registrarTentativaVerificacao({
        tipo: "cpf_receita_federal",
        cnpj_cnpj: limpo,
        resultado: resultado.valido ? "sucesso" : "falha",
        detalhes: resultado,
      });

      return resultado;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";

      this.registrarTentativaVerificacao({
        tipo: "cpf_receita_federal",
        cnpj_cnpj: limpo,
        resultado: "erro",
        erro: mensagem,
      });

      return {
        valido: false,
        erro: `Erro ao verificar CPF: ${mensagem}`,
        fonte: "receita_federal",
      };
    }
  }

  /**
   * Detecta agentes com CPF/CNPJ duplicado
   * @param cpf_cnpj - CPF ou CNPJ a buscar
   * @param excluir_agente_id - ID do agente a excluir da busca (para atualização)
   * @returns Agentes duplicados encontrados
   */
  detectarDuplicataTaxID(
    cpf_cnpj: string,
    excluir_agente_id?: string
  ): DuplicataDetectada[] {
    const limpo = cleanCPFCNPJ(cpf_cnpj);

    // Busca agentes com mesmo CPF/CNPJ
    let query = `
      SELECT id, cpf_cnpj, nome, email, telefone
      FROM agentes_economicos
      WHERE cpf_cnpj = ?
        AND ativo = 1
    `;
    const params: unknown[] = [limpo];

    if (excluir_agente_id) {
      query += " AND id != ?";
      params.push(excluir_agente_id);
    }

    const duplicatas = this.db.prepare(query).all(...params) as Array<{
      id: string;
      cpf_cnpj: string;
      nome: string;
      email?: string | null;
      telefone?: string | null;
    }>;

    return duplicatas.map((dup) => ({
      agente_id_existente: dup.id,
      cpf_cnpj_existente: dup.cpf_cnpj,
      score_similaridade: 100, // Mesmo CPF/CNPJ = match perfeito
      motivos: ["cpf_cnpj_identico"],
    }));
  }

  /**
   * Obtém informações de empresa da base pública
   * @param cnpj - CNPJ da empresa
   * @returns Informações da empresa
   */
  async obterInformacaoEmpresa(cnpj: string): Promise<{
    nomeEmpresa?: string;
    nomeFantasia?: string;
    endereco?: string;
    situacao?: string;
    dataConstituicao?: string;
    dataUltimaAtualizacao?: string;
    erro?: string;
  }> {
    const validacao = cnpjValido(cnpj);

    if (!validacao.valido) {
      return {
        erro: "CNPJ inválido",
      };
    }

    try {
      // Simula consulta a CNP (Cadastro Nacional da Pessoa Jurídica)
      // Em produção, usar API oficial da Receita Federal
      const resultado = await this.consultarReceitaFederal(
        validacao.cnpjLimpo!
      );

      if (!resultado.valido) {
        return {
          erro: resultado.erro,
        };
      }

      return {
        nomeEmpresa: resultado.nomeEmpresa,
        situacao: resultado.situacao,
        dataConstituicao: resultado.dataConstituicao,
        dataUltimaAtualizacao: resultado.dataUltimaAtualizacao,
      };
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";
      return {
        erro: mensagem,
      };
    }
  }

  /**
   * Verifica CNPJ/CPF contra lista OFAC (Office of Foreign Assets Control)
   * Verificação básica para compliance
   * @param cpf_cnpj - CPF ou CNPJ
   * @param nome - Nome da pessoa/empresa
   * @returns true se não está em lista de sanções
   */
  async verificarOFAC(cpf_cnpj: string, nome: string): Promise<boolean> {
    try {
      // Simula verificação OFAC
      // Em produção, consultar lista oficial OFAC
      const resultado = await this.consultarOFAC(cpf_cnpj, nome);

      // Registra verificação
      this.registrarTentativaVerificacao({
        tipo: "ofac",
        cnpj_cnpj: cpf_cnpj,
        resultado: resultado ? "bloqueado" : "aprovado",
      });

      return !resultado; // true = não está bloqueado
    } catch (erro) {
      // Em caso de erro, log mas não bloqueia (fail-open)
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error(`Erro ao verificar OFAC: ${mensagem}`);

      this.registrarTentativaVerificacao({
        tipo: "ofac",
        cnpj_cnpj: cpf_cnpj,
        resultado: "erro",
        erro: mensagem,
      });

      return true; // Não bloqueia por erro
    }
  }

  /**
   * Verifica se um agente foi previamente validado
   * @param agente_id - ID do agente
   * @param tipo_validacao - Tipo de validação
   * @returns Última validação ou null
   */
  obterUltimaValidacao(
    agente_id: string,
    tipo_validacao: TipoValidacao
  ): ValidacaoAgente | null {
    const resultado = this.db
      .prepare(
        `
      SELECT id, agente_id, tipo_validacao, resultado, motivo, detalhes,
             executado_em, executado_por
      FROM agentes_validacoes
      WHERE agente_id = ? AND tipo_validacao = ?
      ORDER BY executado_em DESC
      LIMIT 1
    `
      )
      .get(agente_id, tipo_validacao) as unknown;

    if (!resultado) {
      return null;
    }

    return {
      id: resultado.id,
      agente_id: resultado.agente_id,
      tipo_validacao: resultado.tipo_validacao,
      resultado: resultado.resultado,
      motivo: resultado.motivo,
      detalhes: resultado.detalhes ? JSON.parse(resultado.detalhes) : undefined,
      executado_em: new Date(resultado.executado_em),
      executado_por: resultado.executado_por,
    };
  }

  /**
   * Registra resultado de validação
   * @param agente_id - ID do agente
   * @param tipo_validacao - Tipo de validação
   * @param resultado_validacao - Resultado (aprovado/rejeitado/pendente)
   * @param usuario_id - ID do usuário que executou
   * @param motivo - Motivo (opcional)
   * @param detalhes - Detalhes (opcional)
   */
  registrarValidacao(
    agente_id: string,
    tipo_validacao: TipoValidacao,
    resultado_validacao: ResultadoValidacao,
    usuario_id: string,
    motivo?: string,
    detalhes?: Record<string, any>
  ): ValidacaoAgente {
    const id = uuidv4();

    this.db
      .prepare(
        `
      INSERT INTO agentes_validacoes (
        id, agente_id, tipo_validacao, resultado, motivo, detalhes,
        executado_em, executado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        agente_id,
        tipo_validacao,
        resultado_validacao,
        motivo || null,
        detalhes ? JSON.stringify(detalhes) : null,
        new Date().toISOString(),
        usuario_id
      );

    return {
      id,
      agente_id,
      tipo_validacao,
      resultado: resultado_validacao,
      motivo,
      detalhes,
      executado_em: new Date(),
      executado_por: usuario_id,
    };
  }

  /**
   * ========== MÉTODOS PRIVADOS ==========
   */

  /**
   * Simula consulta a Receita Federal
   * Em produção, integrar com API oficial
   */
  private async consultarReceitaFederal(
    cnpj: string
  ): Promise<ResultadoVerificacao> {
    // Simula delay de rede
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simula algumas validações básicas
    // CNPJs fake para testes
    const cnpjsAtivos = ["00000000000191", "11444777000161"];
    const cnpjsBloqueados = ["00000000000191"];

    const isAtivo = cnpjsAtivos.includes(cnpj);
    const isBloqueado = cnpjsBloqueados.includes(cnpj);

    if (isBloqueado) {
      return {
        valido: false,
        situacao: "cancelado",
        erro: "CNPJ cancelado na Receita Federal",
        fonte: "receita_federal",
      };
    }

    if (isAtivo) {
      return {
        valido: true,
        nomeEmpresa: `Empresa ${cnpj.substring(0, 4)}`,
        situacao: "ativo",
        dataConstituicao: "2010-01-01",
        dataUltimaAtualizacao: new Date().toISOString().split("T")[0],
        fonte: "receita_federal",
      };
    }

    // Para qualquer outro CNPJ, simula como se fosse válido
    return {
      valido: true,
      nomeEmpresa: `Empresa ${cnpj.substring(0, 4)}`,
      situacao: "ativo",
      dataConstituicao: "2015-01-01",
      dataUltimaAtualizacao: new Date().toISOString().split("T")[0],
      fonte: "receita_federal",
    };
  }

  /**
   * Simula consulta a registro de CPF
   * Em produção, integrar com RFB/Serpro
   */
  private async consultarCPF(cpf: string): Promise<ResultadoVerificacao> {
    // Simula delay de rede
    await new Promise((resolve) => setTimeout(resolve, 100));

    // CPFs fake para testes
    const cpfsAtivos = ["11144477735"];
    const cpfsBloqueados = ["00000000000"];

    const isAtivo = cpfsAtivos.includes(cpf);
    const isBloqueado = cpfsBloqueados.includes(cpf);

    if (isBloqueado) {
      return {
        valido: false,
        situacao: "cancelado",
        erro: "CPF cancelado",
        fonte: "receita_federal",
      };
    }

    if (isAtivo) {
      return {
        valido: true,
        situacao: "ativo",
        dataUltimaAtualizacao: new Date().toISOString().split("T")[0],
        fonte: "receita_federal",
      };
    }

    // Para qualquer outro CPF, simula como válido
    return {
      valido: true,
      situacao: "ativo",
      dataUltimaAtualizacao: new Date().toISOString().split("T")[0],
      fonte: "receita_federal",
    };
  }

  /**
   * Simula consulta a lista OFAC
   */
  private async consultarOFAC(cpf_cnpj: string, nome: string): Promise<boolean> {
    // Simula delay de rede
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Simula lista bloqueada (alguns CPF/CNPJ fake)
    const blockedIds = [
      "66666666666666", // CNPJ bloqueado
      "77777777777", // CPF bloqueado
    ];

    return blockedIds.includes(cleanCPFCNPJ(cpf_cnpj));
  }

  /**
   * Registra tentativa de verificação para auditoria
   */
  private registrarTentativaVerificacao(dados: {
    tipo: string;
    cnpj_cnpj: string;
    resultado: string;
    detalhes?: Record<string, any>;
    erro?: string;
  }): void {
    // Pode ser estendido para logging em banco de dados
    // Por enquanto, apenas log em console
    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] Verificação ${dados.tipo}: ${dados.cnpj_cnpj} - ${dados.resultado}`
    );
    if (dados.erro) {
      console.error(`  Erro: ${dados.erro}`);
    }
  }
}
